import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginServerContext } from '@getpaseo/plugin/server';
import { registerServer } from '../server/register.ts';
import { createRewriteService } from '../server/service.ts';

async function fixture(complete: Parameters<typeof createRewriteService>[0]['complete']) {
  const directory = await mkdtemp(join(tmpdir(), 'plain-hook-test-'));
  const callbacks = new Map<string, (event: any, context?: any) => Promise<void>>();
  const methods = new Map<string, (input: any, context?: any) => Promise<any>>();
  const host = {
    handle(contract: { name: string }, handler: any) { methods.set(contract.name, handler); },
    on(name: string, callback: any) { callbacks.set(name, callback); return () => { callbacks.delete(name); }; },
  } as unknown as PluginServerContext;
  const service = createRewriteService({ directory, complete });
  const stop = registerServer(host, service);
  const config = await service.configuration();
  await service.configure({ revision: config.revision, values: { ...config.values, enabled: true } });
  return { callbacks, methods, service, async cleanup() { await stop(); await rm(directory, { recursive: true, force: true }); } };
}

const original = 'The operation completed.';
const request = { agentId: 'pi-agent', original };
const timeline = [
  { type: 'user_message', text: 'Current question' },
  { type: 'reasoning', text: 'Private reasoning' },
  { type: 'tool_call', name: 'bash' },
  { type: 'assistant_message', text: original },
];
const context = { paseo: { agents: { ref: () => ({
  refresh: async () => ({ agent: { status: 'idle' } }),
  timeline: { refetch: async () => ({ agent: { status: 'idle' }, entries: timeline.map((item) => ({ item })), hasOlder: false }) },
}) } } };

test('completed turns and passive reads never invoke a model, even with rewriting enabled', async () => {
  let calls = 0;
  const f = await fixture(async (text) => { calls++; return text.replace(original, 'It worked.'); });
  try {
    const before = JSON.stringify(timeline);
    const event = { agent: { id: 'pi-agent', provider: 'pi' }, timeline };
    await f.callbacks.get('agent.turn_started')!(event);
    for (const kind of ['failed', 'canceled', 'completed']) {
      await f.callbacks.get('agent.turn_ended')?.({ ...event, outcome: { kind } }, context);
      await f.service.settled();
      assert.equal(calls, 0, `${kind} must not trigger a rewrite`);
    }
    for (let i = 0; i < 5; i++) {
      await f.methods.get('plain.configuration')!({});
      assert.equal((await f.methods.get('plain.lookup')!(request)).status, 'uncached');
    }
    assert.equal(calls, 0, 'polling and reconnect-style reads are free of model calls');
    assert.equal(JSON.stringify(timeline), before);
  } finally { await f.cleanup(); }
});

test('only explicit rewrite and model-preview RPCs invoke the model and cache hits are reused', async () => {
  let calls = 0;
  const f = await fixture(async (text) => { calls++; return text.replace(original, 'It worked.'); });
  try {
    assert.equal((await f.methods.get('plain.rewrite')!(request, context)).status, 'pending');
    await f.service.settled();
    assert.equal(calls, 1);
    assert.equal((await f.methods.get('plain.lookup')!(request)).text, 'It worked.');
    assert.equal((await f.methods.get('plain.rewrite')!(request, context)).status, 'ready');
    assert.equal(calls, 1, 'asking again reuses the cached result');
    await f.methods.get('plain.preview')!({ original: 'The preview completed.' });
    await f.service.settled();
    assert.equal(calls, 2);
  } finally { await f.cleanup(); }
});

test('new turns and archive events still cancel explicitly requested pending work', async () => {
  const signals: AbortSignal[] = [];
  const f = await fixture(async (_text, _config, signal) => { signals.push(signal); return new Promise<string>(() => {}); });
  try {
    for (const name of ['agent.turn_started', 'agent.archived']) {
      await f.methods.get('plain.rewrite')!(request, context);
      await f.callbacks.get(name)!({ agent: { id: request.agentId } });
      await f.service.settled();
      assert.ok(signals.at(-1)?.aborted);
      assert.equal((await f.methods.get('plain.lookup')!(request)).status, 'failed');
    }
    assert.equal(signals.length, 2);
  } finally { await f.cleanup(); }
});
