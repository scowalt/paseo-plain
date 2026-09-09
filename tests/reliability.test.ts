import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRewriteService } from '../server/service.ts';
import type { Complete } from '../server/pi-worker.ts';

async function fixture(t: TestContext, complete: Complete) {
  const directory = await mkdtemp(join(tmpdir(), 'plain-reliability-'));
  const service = createRewriteService({ directory, complete });
  t.after(async () => { await service.dispose(); await rm(directory, { recursive: true, force: true }); });
  const initial = await service.configuration();
  await service.configure({ revision: initial.revision, values: { ...initial.values, enabled: true } });
  return { service, directory };
}
const request = { agentId: 'pi-agent', original: 'The operation completed.' };

test('a late model result after cancellation never replaces the original', async (t) => {
  let finish!: (text: string) => void;
  const { service } = await fixture(t, async () => new Promise((resolve) => { finish = resolve; }));
  await service.enqueue(request);
  await service.cancelAgent(request.agentId);
  finish('This result is too late.');
  await service.settled();
  assert.equal((await service.lookup(request)).status, 'failed');
  assert.equal((await service.lookup(request)).text, undefined);
});

test('clearing the cache cancels pending work and late results stay cleared', async (t) => {
  let finish!: (text: string) => void;
  const { service } = await fixture(t, async () => new Promise((resolve) => { finish = resolve; }));
  await service.enqueue(request);
  await service.clear();
  finish('Too late.');
  await service.settled();
  assert.deepEqual(await service.lookup(request), { status: 'uncached' });
});

test('daemon reloads reuse a private cache without saving original text', async (t) => {
  const { service, directory } = await fixture(t, async () => 'It worked.');
  await service.enqueue(request);
  await service.settled();
  assert.ok(!(await readFile(join(directory, 'cache.json'), 'utf8')).includes(request.original));
  if (process.platform === 'win32') {
    // Windows inherits NTFS permissions, not POSIX mode bits. Check the real
    // fixture ACL rather than treating chmod(0600) as a privacy guarantee.
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
      $ErrorActionPreference = 'Stop'
      $broad = @('S-1-1-0','S-1-5-11','S-1-5-32-545')
      $unsafe = @((Get-Acl -LiteralPath $env:PASEO_PLAIN_ACL_TEST).Access | Where-Object {
        $_.AccessControlType -eq 'Allow' -and
        ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::ReadData) -and
        $broad -contains $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      })
      if ($unsafe.Count -ne 0) { exit 1 }
    `], {env: {...process.env, PASEO_PLAIN_ACL_TEST: join(directory, 'cache.json')}, encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 0, 'cache fixture must not grant broad NTFS read access');
  } else {
    assert.equal((await stat(join(directory, 'cache.json'))).mode & 0o777, 0o600);
  }
  await service.dispose();
  const restored = createRewriteService({ directory, complete: async () => { throw new Error('must not call the model'); } });
  try { assert.deepEqual(await restored.lookup(request), { status: 'ready', text: 'It worked.' }); }
  finally { await restored.dispose(); }
});

test('prior prompt policies cannot supply cached text or trigger automatic regeneration', async (t) => {
  const { service, directory } = await fixture(t, async () => { throw new Error('must not call the model'); });
  const { values } = await service.configuration();
  await service.dispose();
  // Persisted cache-key format from released policies 2 and 3, not the current policy constant.
  const legacyRecords = ['2', '3'].map((policy) => ({
    key: createHash('sha256').update(JSON.stringify([policy, request.agentId, request.original, values.model, values.style])).digest('hex'),
    agentId: request.agentId, at: Date.now(), text: 'Earlier prompt rewrite.',
  }));
  await writeFile(join(directory, 'cache.json'), JSON.stringify(legacyRecords));
  let modelCalls = 0;
  const restored = createRewriteService({ directory, complete: async () => { modelCalls++; return 'New rewrite.'; } });
  try {
    for (let i = 0; i < 3; i++) assert.deepEqual(await restored.lookup(request), { status: 'uncached' });
    assert.deepEqual((await restored.configuration()).values, values, 'saved voice and other settings stay unchanged');
    await restored.settled();
    assert.equal(modelCalls, 0, 'loading old cache entries must not regenerate rewrites');
  } finally { await restored.dispose(); }
});

test('model errors and damaged protected spans fail closed', async (t) => {
  const { service } = await fixture(t, async () => 'I removed the code.');
  const input = { ...request, original: 'Keep `npm test`.' };
  await service.enqueue(input);
  await service.settled();
  const result = await service.lookup(input);
  assert.equal(result.status, 'failed');
  assert.equal(result.text, undefined);
});

test('turning rewriting off stops work, and settings revisions prevent lost updates', async (t) => {
  const { service } = await fixture(t, async () => { throw new Error('must not call the model'); });
  const previous = await service.configuration();
  await service.configure({ revision: previous.revision, values: { ...previous.values, enabled: false } });
  assert.deepEqual(await service.enqueue(request), { status: 'disabled' });
  const conflict = await service.configure({ revision: previous.revision, values: previous.values });
  assert.ok(conflict.error?.includes('another client'));
  assert.equal((await service.configuration()).values.enabled, false);
});

test('the queue is bounded when the model stalls', async (t) => {
  let active = 0;
  const { service } = await fixture(t, async (_text, _config, signal) => {
    active++;
    return await new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true }));
  });
  const results = await Promise.all(Array.from({ length: 30 }, (_, n) => service.enqueue({ ...request, original: `Message ${n}.` })));
  assert.equal(active, 2);
  assert.equal(results.filter((r) => r.status === 'pending').length, 22);
  assert.equal(results.filter((r) => r.status === 'failed').length, 8);
});
