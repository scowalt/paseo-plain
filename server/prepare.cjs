// Paseo runs this explicit Git preparation step, without an npm lifecycle hook.
const { existsSync } = require('node:fs');
const { delimiter, join } = require('node:path');
const { spawnSync } = require('node:child_process');
let command = 'npm', prefix = [];
if (process.platform === 'win32') {
    const directory = (process.env.PATH || '').split(delimiter).find(dir => existsSync(join(dir, 'npm.cmd')));
    const cli = directory && join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!cli || !existsSync(cli)) {
        console.error('Paseo Plain requires a standard Node.js/npm installation on the daemon PATH.');
        process.exit(1);
    }
    command = process.execPath;
    prefix = [cli];
}
const result = spawnSync(command, [...prefix, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    stdio: 'inherit', shell: false, timeout: 180000,
});
if (result.error || result.status !== 0) {
    console.error('Paseo Plain dependency preparation failed.');
    process.exit(1);
}
