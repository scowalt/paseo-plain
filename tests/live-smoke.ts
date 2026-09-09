// Explicit opt-in: uses the configured daemon and one real model call for a synthetic sample.
import assert from 'node:assert/strict';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import type { PluginRpcContract } from '@getpaseo/plugin';
import type { ZodType, input, output } from 'zod';
import { readConfiguration, previewRewrite, lookupRewrite } from '../shared/contracts';

if (process.env.PASEO_PLAIN_LIVE_TEST !== '1') throw new Error('Set PASEO_PLAIN_LIVE_TEST=1 to opt in to a real rewrite.');
const client = new DaemonClient({ url: process.env.PASEO_PLAIN_TEST_URL || 'ws://127.0.0.1:6767/ws', clientId: 'paseo-plain-smoke', clientType: 'cli', reconnect: { enabled: false } });
const invoke = (name: string, input: unknown) => client.invokePluginRpc('paseo-plain', name, input);
async function callPluginRpc<I extends ZodType, O extends ZodType>(contract: PluginRpcContract<I, O>, call: typeof invoke, value: input<I>): Promise<output<O>> {
  return contract.output.parse(await call(contract.name, contract.input.parse(value)));
}
try {
  await client.connect();
  const config = await callPluginRpc(readConfiguration, invoke, {});
  assert.ok(config.values.enabled, 'Enable rewriting in Paseo Plain settings first.');
  const original = 'The configuration change has been applied. I have not run the tests, so the fix is not yet verified.\n\nRun `npm test` before deploying.';
  const start = Date.now();
  let result = await callPluginRpc(previewRewrite, invoke, { original });
  while (result.status === 'pending' && Date.now() - start < 130000) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await callPluginRpc(lookupRewrite, invoke, { agentId: 'plain-preview', original });
  }
  assert.equal(result.status, 'ready');
  assert.ok(result.text?.includes('`npm test`'));
  assert.ok(/not|haven.t|hasn.t|isn.t|unverified|unconfirmed/i.test(result.text!));
  assert.deepEqual(await callPluginRpc(lookupRewrite, invoke, { agentId: 'plain-preview', original }), result);
  console.log(JSON.stringify({ status: result.status, model: config.values.model, elapsedMs: Date.now() - start, protectedCommand: true, uncertainty: true, cacheLookup: true }));
} finally { await client.close(); }
