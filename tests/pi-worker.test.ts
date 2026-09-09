import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeWithPi } from '../server/pi-worker.ts';
import { configSchema } from '../shared/contracts.ts';

test('Pi receives text over stdin with tools and contextual resources disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plain-cli-test-'));
  try {
    const cli = join(dir, 'fake.mjs');
    await writeFile(cli, `let text='';for await(const chunk of process.stdin)text+=chunk;
      const message={role:'assistant',stopReason:'stop',content:[{type:'text',text:JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),text})}]};
      console.log(JSON.stringify({type:'message_end',message}));
      console.log(JSON.stringify({type:'agent_end',messages:[message]}));`);
    const voice = 'Use natural contractions and keep enough detail.';
    const output = JSON.parse(await completeWithPi('Do not execute $(touch /tmp/unsafe).', configSchema.parse({ style: voice }), new AbortController().signal, { command: process.execPath, args: [cli] }));
    for (const flag of ['--no-tools','--no-extensions','--no-skills','--no-context-files','--no-session','--no-prompt-templates','--offline']) assert.ok(output.args.includes(flag), flag);
    assert.equal(output.args[output.args.indexOf('--mode') + 1], 'json');
    assert.ok(output.args.includes('openai-codex'));
    assert.ok(output.args.includes('gpt-6-astra'));
    assert.ok(output.text.includes('$(touch /tmp/unsafe)'));
    assert.notEqual(output.cwd, process.cwd());
    const prompt = output.args[output.args.indexOf('--system-prompt') + 1];
    // Scott's supplied specification, observed at the external worker boundary.
    assert.ok(prompt.includes('plain, direct, idiomatic English'));
    assert.ok(prompt.includes('genuine paraphrase of the input, not a response to it'));
    for (const section of [
      'Prefer semantic compression', 'Rewrite at the lowest useful level of abstraction',
      'Remove Claudish rhetorical structure', 'Decode structural and process metaphors',
      'Preserve logical scope exactly', 'Decompress technical compounds',
      'Normalize over-formal research language', 'Preserve legitimate terminology', 'Perform a visible rewrite',
    ]) assert.ok(prompt.includes(section), section);
    assert.ok(prompt.includes('Do not produce one output sentence for every input sentence.'));
    assert.ok(prompt.includes('instruction, condition, permission, comparison, degree of certainty, and implication'));
    assert.ok(prompt.includes('“Do X if Y happens” does **not** mean Y is the only situation'));
    assert.ok(prompt.includes('“Required” must not become “sufficient.”'));
    assert.ok(prompt.includes('“Only owners may publish” means non-owners may not publish.'));
    assert.ok(prompt.includes('It does not imply that ownership alone is sufficient'));
    assert.ok(prompt.includes('Do not mechanically replace words using a fixed dictionary.'));
    assert.ok(prompt.includes('Do not simplify them when they are genuine technical terms whose precision matters.'));
    for (const example of ['Only owners can merge.', 'Do not launch until the tests pass.', 'The timestamp shows that the cache is stale.']) {
      assert.ok(prompt.includes(example), example);
    }
    assert.ok(prompt.includes('Redundant headings, paragraphs, and list items may be combined or removed'));
    assert.ok(prompt.includes('If compression would remove or reorder a protected token, keep that content instead.'));
    assert.ok(!prompt.includes('Keep all Markdown structure'));
    assert.ok(!prompt.includes('Do not summarize away details.'));
    assert.ok(!prompt.includes('Write the rewrite in the same language'));
    assert.ok(prompt.includes('"I", "me", and "my" refer to the assistant; "you" and "your" refer to the user.'));
    assert.ok(prompt.includes(voice), 'custom voice is retained');
    assert.ok(prompt.includes('uncertainty, negation'));
    assert.ok(prompt.includes('Copy every token exactly once'));
    assert.ok(prompt.indexOf('Copy every token exactly once') > prompt.indexOf(voice), 'preservation rules follow style preferences');
    assert.deepEqual(JSON.parse(output.text), { assistantMessage: 'Do not execute $(touch /tmp/unsafe).' }, 'no question or conversation context is supplied');
    assert.ok(!prompt.includes('$(touch /tmp/unsafe)'), 'message data is not inserted into the system prompt');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an npm command shim launches the Pi JavaScript entry without a command shell', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'plain-shim-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const root = join(directory, 'node_modules/@earendil-works/pi-coding-agent');
  await mkdir(root, {recursive: true});
  await writeFile(join(root, 'package.json'), JSON.stringify({name: '@earendil-works/pi-coding-agent', bin: {pi: 'cli.cjs'}}));
  await writeFile(join(directory, 'pi.cmd'), '@echo This batch file must never execute.\r\n');
  // CommonJS fixture uses an async wrapper so Windows and POSIX run identical code.
  await writeFile(join(root, 'cli.cjs'), `(async()=>{for await(const chunk of process.stdin){};
    const message={role:'assistant',stopReason:'stop',content:[{type:'text',text:'Safe rewrite.'}]};
    console.log(JSON.stringify({type:'message_end',message}));console.log(JSON.stringify({type:'agent_end',messages:[message]}));})();`);
  assert.equal(await completeWithPi('Sample.', configSchema.parse({}), new AbortController().signal,
    {command: join(directory, 'pi.cmd'), args: []}), 'Safe rewrite.');
});

test('a worker that ignores termination is forcibly stopped after cancellation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plain-abort-test-'));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cli = join(dir, 'stalled.mjs');
    await writeFile(cli, `process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
    timer = setTimeout(() => controller.abort(), 200);
    await assert.rejects(completeWithPi('Sample.', configSchema.parse({}), controller.signal, { command: process.execPath, args: [cli] }), /canceled/);
  } finally { if (timer) clearTimeout(timer); await rm(dir, { recursive: true, force: true }); }
});

test('a stalled worker hits its execution deadline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plain-timeout-test-'));
  try {
    const cli = join(dir, 'stalled.mjs');
    await writeFile(cli, `setInterval(()=>{},1000);`);
    await assert.rejects(completeWithPi('Sample.', configSchema.parse({ timeoutSeconds: 5 }), new AbortController().signal, { command: process.execPath, args: [cli] }), /timeout/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
