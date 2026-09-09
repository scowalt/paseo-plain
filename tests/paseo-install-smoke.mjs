// Optional packaging check against an installed Paseo 0.8 runtime. No daemon,
// network listener, authenticated client, or model is started by this check.
import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.PASEO_RUNTIME_MODULE, 'Set PASEO_RUNTIME_MODULE to Paseo server/plugins/runtime.js');
assert.ok(process.argv[2], 'Supply a clean checkout prepared with production dependencies only');
const { PluginRuntime } = await import(pathToFileURL(resolve(process.env.PASEO_RUNTIME_MODULE)).href);
const directory = resolve(process.argv[2]);
const home = await mkdtemp(join(tmpdir(), 'plain-paseo-install-'));
const marker = join(home, 'unexpected-model-call');
const worker = join(home, 'never-run.cjs');
await writeFile(worker, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected'); process.exit(99);`);
process.env.PASEO_HOME = home;
process.env.HOME = home;
process.env.PASEO_PLAIN_PI_BIN = worker;
const logger = {child() {return this;}, info() {}, warn() {}, error() {}, debug() {}};
const runtime = new PluginRuntime(logger, '0.8.0-beta.1', {
  sessionHost: {
    async attachPluginSocket(_id, socket) {
      const closed = new Promise(resolve => socket.once('close', resolve));
      socket.on('message', data => {
        if (typeof data !== 'string' || JSON.parse(data).type !== 'hello') return;
        socket.send(JSON.stringify({type:'session', message:{type:'status', payload:{
          status:'server_info', serverId:'isolated-plugin-test', hostname:'isolated-plugin-test',
          version:'0.8.0-beta.1', features:{},
        }}}));
      });
      return {closed};
    },
  },
});
try {
  await runtime.startPlugin('paseo-plain', directory);
  assert.ok(runtime.catalog()[0].clientBundle);
  const initial = await runtime.invoke('paseo-plain', 'plain.configuration', {});
  assert.equal(initial.error, null);
  assert.equal(initial.values.enabled, false);
  const saved = await runtime.invoke('paseo-plain', 'plain.configure', {
    revision:initial.revision, values:{...initial.values, enabled:true, style:'Fixture preference.'},
  });
  assert.deepEqual(await runtime.invoke('paseo-plain', 'plain.lookup', {agentId:'fixture', original:'Example answer.'}), {status:'uncached'});
  await runtime.stopPluginById('paseo-plain');
  await runtime.startPlugin('paseo-plain', directory);
  assert.deepEqual(await runtime.invoke('paseo-plain', 'plain.configuration', {}), saved);
  assert.deepEqual(await runtime.invoke('paseo-plain', 'plain.lookup', {agentId:'fixture', original:'Example answer.'}), {status:'uncached'});
  await assert.rejects(access(marker), {code:'ENOENT'});
  console.log('Clean checkout loaded and reloaded in Paseo, retained settings, and made zero model calls.');
} finally {
  await runtime.stopAll();
  await rm(home, {recursive:true, force:true});
}
