import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { Configuration } from '../shared/contracts';
import { buildRewritePrompt } from './prompt';
import { PiCompletionReader } from './pi-output';
export { PROMPT_VERSION } from './prompt';

export type Complete = (text: string, config: Configuration, signal: AbortSignal) => Promise<string>;

// Windows npm .cmd shims cannot be spawned without a shell. Resolve only the
// installed Pi package's declared JavaScript entry instead of evaluating a shim.
function piExecutable(executable: { command: string; args: string[] }) {
  let command = executable.command;
  if (process.platform === 'win32' && command === 'pi') {
    for (const directory of (process.env.PATH || '').split(delimiter).filter(isAbsolute)) {
      const native = join(directory, 'pi.exe'), shim = join(directory, 'pi.cmd');
      if (existsSync(native)) return { command: native, args: executable.args };
      if (existsSync(shim)) { command = shim; break; }
    }
  }
  if (!command.toLowerCase().endsWith('.cmd')) return { ...executable, command };
  if (basename(command).toLowerCase() !== 'pi.cmd') throw new Error('pi-unavailable');
  for (const base of [join(dirname(command), 'node_modules'), resolve(dirname(command), '../install/global/node_modules')]) {
    try {
      const root = resolve(base, '@earendil-works/pi-coding-agent');
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.pi;
      if (pkg.name !== '@earendil-works/pi-coding-agent' || typeof bin !== 'string') continue;
      const script = resolve(root, bin);
      if (!script.startsWith(root + sep) || !statSync(script).isFile()) continue;
      return { command: process.execPath, args: [script, ...executable.args] };
    } catch { /* Try the other standard package-manager layout; never log package data. */ }
  }
  throw new Error('pi-unavailable');
}

/** Direct argv + stdin, no shell. Authentication stays owned by the existing Pi installation. */
export async function completeWithPi(text: string, config: Configuration, signal: AbortSignal,
  executable = { command: process.env.PASEO_PLAIN_PI_BIN || 'pi', args: [] as string[] }): Promise<string> {
  if (signal.aborted) throw new Error('canceled');
  const resolved = piExecutable(executable);
  const cwd = await mkdtemp(join(tmpdir(), 'paseo-plain-'));
  try {
    if (signal.aborted) throw new Error('canceled');
    return await new Promise<string>((resolve, reject) => {
      const env = { ...process.env };
      for (const key of ['PASEO_AGENT_ID','PASEO_AGENT_CWD','PI_SESSION_FILE','PI_SESSION_ID']) delete env[key];
      const child = spawn(resolved.command, [...resolved.args,
        '--offline', '--print', '--mode', 'json', '--no-session', '--no-tools', '--no-extensions', '--no-skills',
        '--no-context-files', '--no-prompt-templates', '--no-themes',
        '--provider', 'openai-codex', '--model', config.model, '--thinking', 'low',
        '--system-prompt', buildRewritePrompt(config.style),
      ], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      const output = new PiCompletionReader();
      let failure: string | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = (reason: string) => {
        failure ??= reason;
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1000);
      };
      const abort = () => stop('canceled');
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timeout = setTimeout(() => stop('timeout'), config.timeoutSeconds * 1000);
      const cleanup = () => {
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        signal.removeEventListener('abort', abort);
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (failure) return;
        try { output.push(chunk); }
        catch (error) { stop(error instanceof Error ? error.message : 'pi-invalid-output'); }
      });
      // Drain stderr without retaining or logging model/provider content.
      child.stderr.resume();
      child.stdin.on('error', () => stop('input-failed'));
      child.on('error', () => { cleanup(); reject(new Error('pi-unavailable')); });
      child.on('close', (code) => {
        cleanup();
        if (failure || code !== 0) reject(new Error(failure ?? 'pi-failed'));
        else {
          try { resolve(output.finish()); }
          catch (error) { reject(error); }
        }
      });
      child.stdin.end(JSON.stringify({ assistantMessage: text }));
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
