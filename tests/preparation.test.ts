import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';

test('Git preparation installs only locked runtime dependencies without lifecycle scripts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'plain-build-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const npm = process.platform === 'win32' ? join(bin, 'node_modules/npm/bin/npm-cli.js') : join(bin, 'npm');
  await mkdir(resolve(npm, '..'), {recursive: true});
  await writeFile(npm, '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));process.exit(Number(process.env.FAKE_BUILD_FAIL || 0));\n');
  await chmod(npm, 0o700);
  if (process.platform === 'win32') await writeFile(join(bin, 'npm.cmd'), 'not executed');
  const manifest = JSON.parse(await readFile(new URL('../paseo-plugin.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(manifest.build) && manifest.build.length > 0, 'Git installs must prepare non-host dependencies');
  for (const command of manifest.build as string[][]) {
    for (const fail of ['0', '1']) {
      const result = spawnSync(command[0], command.slice(1), {
        encoding: 'utf8', shell: false,
        env: {...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, FAKE_BUILD_FAIL: fail},
      });
      assert.equal(result.status, Number(fail), result.stderr);
      assert.deepEqual(JSON.parse(result.stdout.trim()), ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']);
    }
  }
});
