import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeWithPi } from '../server/pi-worker';
import { configSchema } from '../shared/contracts';
import { createRewriteService } from '../server/service';

async function fakeCli(t: TestContext, script: string) {
  const dir = await mkdtemp(join(tmpdir(), 'plain-completion-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'fake.mjs');
  await writeFile(path, `for await (const chunk of process.stdin) {}\n${script}`);
  return { command: process.execPath, args: [path] };
}
const message = (stopReason = 'stop', text = 'It worked.') => ({ role: 'assistant', stopReason, content: [{ type: 'text', text }] });
const stream = (m: object) => [{ type: 'session', version: 3 }, { type: 'agent_start' }, { type: 'message_end', message: m }, { type: 'turn_end', message: m, toolResults: [] }, { type: 'agent_end', messages: [m] }];
const emit = (events: object[]) => `for (const event of ${JSON.stringify(events)}) console.log(JSON.stringify(event));`;
const run = (cli: Awaited<ReturnType<typeof fakeCli>>) => completeWithPi('The operation completed.', configSchema.parse({}), new AbortController().signal, cli);

test('reported truncation rejects the rewrite even when Pi exits successfully', async (t) => {
  const cli = await fakeCli(t, emit(stream(message('length', 'The partial rewrite'))));
  await assert.rejects(run(cli), /pi-incomplete/);
});

test('only final text is returned across fragmented UTF-8 records, never thinking or deltas', async (t) => {
  const m = { ...message(), content: [{ type: 'thinking', thinking: 'Private reasoning must not appear.' }, { type: 'text', text: 'Café ' }, { type: 'text', text: '🙂 works.' }] };
  const events = [
    ...stream(m).slice(0, 2),
    { type: 'message_end', message: { role: 'user', content: 'Only input, never output.' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Outdated partial text.' } },
    ...stream(m).slice(2),
  ];
  const data = events.map((event) => JSON.stringify(event)).join('\r\n');
  const cli = await fakeCli(t, `const bytes=Buffer.from(${JSON.stringify(data)});for(let i=0;i<bytes.length;i++){process.stdout.write(bytes.subarray(i,i+1));await new Promise(resolve=>setImmediate(resolve));}`);
  assert.equal(await run(cli), 'Café 🙂 works.');
});

test('reasoning, refusals, errors, tools, and unfinished stop reasons cannot become a rewrite', async (t) => {
  const badMessages = [
    ...['pending', 'toolUse', 'error', 'aborted', 'deferred', 'unknown'].map((reason) => message(reason)),
    { ...message(), stopReason: undefined },
    { ...message(), rawStopReason: 'max_output_tokens' },
    { ...message(), rawStopReason: { toString: null, valueOf: null } },
    { ...message(), errorMessage: 'Sensitive provider detail must not be exposed.' },
    { ...message(), content: [{ type: 'thinking', thinking: 'Not an answer.' }] },
    { ...message(), content: [{ type: 'toolCall', name: 'bash' }] },
    { ...message(), content: [{ type: 'refusal', refusal: 'Not an answer.' }] },
    { ...message(), content: [{ type: 'text', text: 42 }] },
    message('stop', '   '),
  ];
  for (const m of badMessages) {
    const cli = await fakeCli(t, emit(stream(m)));
    await assert.rejects(run(cli), /^(?:Error: )?(?:pi-incomplete|pi-invalid-output|empty)$/);
  }
});

test('missing, conflicting, duplicated, or malformed terminal records fail instead of returning partial text', async (t) => {
  const good = message();
  const cases = [
    '',
    'It worked.', // A plain-text producer cannot bypass the finish-reason check.
    JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Partial.' } }),
    JSON.stringify({ type: 'message_end', message: good }),
    stream(good).map((event) => JSON.stringify(event)).join('\n') + '\n{"type":',
    ...[
      [{ type: 'agent_end', messages: [good] }],
      [{ type: 'message_end', message: good }, { type: 'message_end', message: good }, { type: 'agent_end', messages: [good] }],
      [{ type: 'message_end', message: good }, { type: 'agent_end', messages: [message('stop', 'Different.')] }],
      [{ type: 'message_end', message: good }, { type: 'agent_end', messages: [message('length')] }],
      [{ type: 'message_end', message: good }, { type: 'turn_end', message: message('length'), toolResults: [] }, { type: 'agent_end', messages: [good] }],
      [...stream(good), { type: 'agent_end', messages: [good] }],
      [...stream(good), { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Too late.' } }],
    ].map((events) => events.map((event) => JSON.stringify(event)).join('\n')),
  ];
  for (const data of cases) {
    const cli = await fakeCli(t, `process.stdout.write(${JSON.stringify(data)});`);
    await assert.rejects(run(cli), /pi-incomplete|pi-invalid-output/);
  }
});

test('provider failure signals stop the worker rather than accepting a later successful-looking result', async (t) => {
  for (const event of [
    { type: 'message_update', assistantMessageEvent: { type: 'done', reason: 'length' } },
    { type: 'message_update', assistantMessageEvent: { type: 'error', reason: 'error' } },
    { type: 'message_update', assistantMessageEvent: { type: 'toolcall_start', toolName: 'bash' } },
    { type: 'error', message: 'Sensitive failure detail.' },
    { type: 'tool_execution_start', toolName: 'bash' },
    { type: 'auto_retry_start' },
  ]) {
    const cli = await fakeCli(t, emit([event, ...stream(message())]));
    await assert.rejects(run(cli), /^Error: pi-incomplete$/);
  }
});

test('successful-looking output is rejected when the Pi process exits with an error', async (t) => {
  const cli = await fakeCli(t, emit(stream(message())) + '\nprocess.exitCode=1;');
  await assert.rejects(run(cli), /pi-failed/);
});

test('delta traffic has its own budget rather than consuming the final-text limit', async (t) => {
  const cli = await fakeCli(t, `for(let i=0;i<2000;i++)console.log(JSON.stringify({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'x'.repeat(40)}}));\n${emit(stream(message()))}`);
  assert.equal(await run(cli), 'It worked.');
});

test('oversized text, records, and event streams stop the worker', async (t) => {
  for (const script of [
    emit(stream(message('stop', 'x'.repeat(128001)))),
    `process.stdout.write('x'.repeat(1024*1024+1));`,
    `for(let i=0;i<200;i++)console.log(JSON.stringify({type:'metadata',value:'x'.repeat(64000)}));`,
  ]) {
    const cli = await fakeCli(t, script);
    await assert.rejects(run(cli), /output-limit/);
  }
});

test('the service never displays or caches a reported truncated answer, even with every protected token intact', async (t) => {
  const cli = await fakeCli(t, emit(stream(message('length', 'An apparently complete answer.'))));
  // Return the exact masked input, so placeholder validation alone would pass.
  await writeFile(cli.args[0], `let input='';for await(const chunk of process.stdin)input+=chunk;
    const m={role:'assistant',stopReason:'length',content:[{type:'text',text:JSON.parse(input).assistantMessage}]};
    console.log(JSON.stringify({type:'message_end',message:m}));
    console.log(JSON.stringify({type:'agent_end',messages:[m]}));`);
  const directory = await mkdtemp(join(tmpdir(), 'plain-truncation-cache-'));
  const service = createRewriteService({ directory, complete: (text, config, signal) => completeWithPi(text, config, signal, cli) });
  try {
    const initial = await service.configuration();
    await service.configure({ revision: initial.revision, values: { ...initial.values, enabled: true } });
    const request = Object.freeze({ agentId: 'pi-test', original: 'I have not verified the fix.\n\nRun `npm test`.' });
    await service.enqueue(request);
    await service.settled();
    const result = await service.lookup(request);
    assert.equal(result.status, 'failed');
    assert.equal(result.text, undefined, 'no partial replacement is exposed to the renderer');
    assert.equal(request.original, 'I have not verified the fix.\n\nRun `npm test`.');
    await service.dispose();
    const restored = createRewriteService({ directory, complete: async () => { throw new Error('must not run a model'); } });
    try { assert.deepEqual(await restored.lookup(request), { status: 'uncached' }); }
    finally { await restored.dispose(); }
  } finally { await service.dispose(); await rm(directory, { recursive: true, force: true }); }
});
