import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { preparePrivateDirectory } from '../server/private-directory.ts';

test('private storage can be initialized in an isolated empty directory', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'plain-storage-permissions-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  try { await preparePrivateDirectory(directory); }
  catch (error) {
    // This test contains no messages, authentication, or user configuration.
    // Report only the permissions command's diagnostic for this empty fixture.
    const result = error as {stderr?: string; code?: string};
    assert.fail((result.stderr || result.code || 'storage initialization failed').slice(0, 2500));
  }
});
