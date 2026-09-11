import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRewriteService } from '../server/service.ts';
import { promptSamples } from './prompt-samples.ts';

test('two connected clients share one pending rewrite and a cached result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plain-service-test-'));
  let calls = 0;
  let resolve!: (text: string) => void;
  const service = createRewriteService({ directory, complete: async () => {
    calls++;
    return await new Promise<string>((done) => { resolve = done; });
  } });
  try {
    const configuration = await service.configuration();
    await service.configure({ revision: configuration.revision, values: { ...configuration.values, enabled: true } });
    const request = { agentId: 'pi-agent', original: 'The operation completed.' };
    assert.equal((await service.enqueue(request)).status, 'pending');
    assert.equal((await service.enqueue(request)).status, 'pending');
    assert.equal(calls, 1);
    resolve('It worked.');
    await service.settled();
    assert.deepEqual(await service.lookup(request), { status: 'ready', text: 'It worked.' });
    assert.equal(calls, 1);
  } finally { await service.dispose(); await rm(directory, { recursive: true, force: true }); }
});

// These checks establish acceptance/caching of reviewed prose and useful structure,
// not whether a real model will produce the reference wording.
for (const sample of promptSamples) test(`the service accepts and caches a reviewed whole-answer ${sample.id}`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plain-whole-answer-test-'));
  let calls = 0;
  const service = createRewriteService({ directory, complete: async (masked) => {
    calls++;
    const tokens = masked.match(/⟦KEEP_[^⟧]+⟧/g) ?? [];
    assert.equal(tokens.length, sample.protected.length);
    let remaining: string = sample.reference;
    let answer = '';
    // Consume reference prose once; never replace a digit inside a generated token.
    sample.protected.forEach((literal, index) => {
      const at = remaining.indexOf(literal);
      assert.ok(at >= 0, literal);
      answer += remaining.slice(0, at) + tokens[index];
      remaining = remaining.slice(at + literal.length);
    });
    return answer + remaining;
  } });
  try {
    const configuration = await service.configuration();
    await service.configure({ revision: configuration.revision, values: { ...configuration.values, enabled: true } });
    const request = { agentId: 'pi-agent', original: sample.original };
    assert.deepEqual(await service.lookup(request), { status: 'uncached' });
    assert.equal(calls, 0);
    await service.enqueue(request);
    await service.settled();
    for (let i = 0; i < 2; i++) assert.deepEqual(await service.lookup(request), { status: 'ready', text: sample.reference });
    assert.equal(calls, 1);
    assert.equal(request.original, sample.original, 'the original answer remains unchanged');
  } finally { await service.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('a condensed rewrite can remove rhetorical headings while retaining a protected code block', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plain-compression-test-'));
  // A known-good paraphrase from Scott's example, not a claim about model quality.
  const service = createRewriteService({ directory, complete: async (masked) => {
    assert.ok(!masked.includes('npm test'));
    const tokens = masked.match(/⟦KEEP_[^⟧]+⟧/g) ?? [];
    assert.equal(tokens.length, 1);
    return `Do not launch until the tests pass.\n\n${tokens[0]}`;
  } });
  try {
    const configuration = await service.configuration();
    await service.configure({ revision: configuration.revision, values: { ...configuration.values, enabled: true } });
    const request = {
      agentId: 'pi-agent',
      original: '## The key distinction\n\nPassing tests is a mandatory launch requirement.\n\nIn other words, do not launch until the tests pass.\n\n### The actual constraint\n\nPassing tests is required before launch.\n\n```sh\nnpm test\n```',
    };
    await service.enqueue(request);
    await service.settled();
    assert.deepEqual(await service.lookup(request), {
      status: 'ready', text: 'Do not launch until the tests pass.\n\n```sh\nnpm test\n```',
    });
  } finally { await service.dispose(); await rm(directory, { recursive: true, force: true }); }
});
