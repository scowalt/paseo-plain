// Explicit Test Pi rewrite comparison: six calls on synthetic data, never a live daemon.
// Not matched by npm test. No automatic retries or model-based grading.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { configSchema } from '../shared/contracts.ts';
import { completeWithPi } from '../server/pi-worker.ts';
import { buildRewritePrompt, PROMPT_VERSION } from '../server/prompt.ts';
import { preparePrivateDirectory } from '../server/private-directory.ts';
import { rewriteText } from '../server/rewriter.ts';
import { promptSamples } from './prompt-samples.ts';
import { hardPromptSamples } from './prompt-hard-samples.ts';

if (process.env.PASEO_PLAIN_PROMPT_COMPARISON !== '1') {
  throw new Error('Explicit consent required: PASEO_PLAIN_PROMPT_COMPARISON=1 runs six real-model calls on synthetic answers.');
}
const suite = process.env.PASEO_PLAIN_PROMPT_COMPARISON_SUITE || 'basic';
assert.ok(suite === 'basic' || suite === 'hard', 'Unknown comparison suite; use basic or hard.');
const samples = suite === 'hard' ? hardPromptSamples : promptSamples;
assert.equal(samples.length, 3, 'A comparison is limited to three pairs, six model calls.');
const baselineRevision = '77d32ec90f7f3074307802ff2d2eab1ee289d472';
const root = fileURLToPath(new URL('../', import.meta.url));
// Even read-only Git calls must resolve this repository, not an inherited hook/worktree.
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
const oldPrompt = execFileSync('git', ['-C', root, 'show', `${baselineRevision}:server/prompt.ts`], {
  env: { ...gitEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull },
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
});
const directory = await mkdtemp(join(tmpdir(), 'paseo-plain-prompt-comparison-'));
await preparePrivateDirectory(directory);
const baselineDirectory = join(directory, 'baseline');
await mkdir(baselineDirectory, { mode: 0o700 });
const reportPath = join(directory, 'comparison.json');
try {
  await writeFile(join(baselineDirectory, 'package.json'), '{"type":"module"}', { mode: 0o600 });
  await writeFile(join(baselineDirectory, 'prompt.ts'), oldPrompt, { mode: 0o600 });
  for (const name of ['pi-worker.ts', 'pi-output.ts']) await copyFile(join(root, 'server', name), join(baselineDirectory, name));
  // Both versions use the same worker/validator; only the built-in prompt differs.
  const baseline = await import(pathToFileURL(join(baselineDirectory, 'pi-worker.ts')).href);
  assert.equal(baseline.PROMPT_VERSION, '4');
  assert.notEqual(PROMPT_VERSION, baseline.PROMPT_VERSION);
  const config = configSchema.parse({ enabled: true }); // Same defaults, no saved settings are read or changed.
  const variants = [
    { label: 'baseline', policy: baseline.PROMPT_VERSION as string, complete: baseline.completeWithPi as typeof completeWithPi },
    { label: 'candidate', policy: PROMPT_VERSION, complete: completeWithPi },
  ];
  const measurements = (text: string) => ({
    words: text.trim().split(/\s+/).length,
    headings: (text.match(/^#{1,6}\s/gm) ?? []).length,
    listItems: (text.match(/^\s*(?:[-*+] |\d+\. )/gm) ?? []).length,
    blocks: text.trim().split(/\n\s*\n/).length,
  });
  const results: Array<Record<string, unknown>> = [];
  const save = () => writeFile(reportPath, JSON.stringify({
    suite, baselineRevision, candidatePromptSha256: createHash('sha256').update(buildRewritePrompt(config.style)).digest('hex'),
    workerSha256, model: config.model, thinking: 'low', timeoutSeconds: config.timeoutSeconds,
    maxCalls: 6, attemptedCalls: results.length, results,
    note: 'Synthetic text only. Counts are descriptive, not quality scores. Review every fact and condition manually.',
  }, null, 2), { mode: 0o600 });
  const workerSha256 = createHash('sha256').update(await readFile(join(root, 'server/pi-worker.ts'))).digest('hex');
  console.log(`Test Pi rewrite: synthetic-only comparison; private report ${reportPath}`);
  for (const sample of samples) {
    for (const variant of variants) {
      assert.ok(results.length < 6);
      const entry: Record<string, unknown> = { sample: sample.id, variant: variant.label, policy: variant.policy,
        original: sample.original, review: sample.review, before: measurements(sample.original), status: 'started' };
      results.push(entry);
      await save(); // Record the attempt before invoking the worker, including an interrupted run.
      const start = Date.now();
      try {
        const text = await rewriteText(sample.original, (masked) => variant.complete(masked, config, new AbortController().signal));
        Object.assign(entry, { status: 'ready', text, after: measurements(text) });
      } catch (error) {
        const codes = ['preservation', 'timeout', 'canceled', 'pi-failed', 'pi-unavailable', 'pi-invalid-output',
          'pi-incomplete', 'input-failed', 'output-limit', 'empty', 'empty-or-oversize'];
        entry.status = 'failed';
        entry.reason = error instanceof Error && codes.includes(error.message) ? error.message : 'comparison-failed';
      }
      entry.elapsedMs = Date.now() - start;
      await save();
      console.log(`${sample.id}/${variant.label}: ${entry.status} (${entry.elapsedMs} ms)`);
    }
  }
  if (results.some((result) => result.status !== 'ready')) process.exitCode = 1;
} finally {
  // Retain only the private synthetic report, not executable temporary source.
  await rm(baselineDirectory, { recursive: true, force: true });
}
