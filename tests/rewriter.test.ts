import assert from 'node:assert/strict';
import test from 'node:test';
import { rewriteText } from '../server/rewriter.ts';

test('the rewrite model cannot change a code block', async () => {
  const original = 'The operation completed.\n\n```sh\nnpm test\n```';
  let sent = '';
  const result = await rewriteText(original, async (text) => {
    sent = text;
    return text.replace('The operation completed.', 'It worked.');
  });
  assert.equal(sent.includes('npm test'), false);
  assert.equal(result, 'It worked.\n\n```sh\nnpm test\n```');
});

test('technical details and quoted errors never reach the rewrite model', async () => {
  const original = 'Inspect `npm test`, src/main.ts, config.json, https://example.com, 42%, and "Permission denied".';
  const result = await rewriteText(original, async (masked) => {
    for (const exact of ['npm test', 'src/main.ts', 'config.json', 'https://example.com', '42%', 'Permission denied']) {
      assert.equal(masked.includes(exact), false, exact);
    }
    return masked.replace('Inspect', 'Look at');
  });
  assert.equal(result, original.replace('Inspect', 'Look at'));
});

test('missing, duplicated, or reordered protected details reject the rewrite', async () => {
  for (const change of [
    (tokens: string[]) => tokens[0],
    (tokens: string[]) => tokens.join(' ') + tokens[0],
    (tokens: string[]) => tokens.toReversed().join(' '),
  ]) {
    await assert.rejects(rewriteText('Use `one`, then `two`.', async (masked) => change(masked.match(/⟦KEEP_[^⟧]+⟧/g)!)), /preservation/);
  }
});

test('invented commands, code, numbers, and links reject the rewrite', async () => {
  for (const addition of ['`rm -rf /tmp/example`', '~~~sh\nnpm test\n~~~', 'https://example.com', '42']) {
    await assert.rejects(rewriteText('It worked.', async () => `It worked.\n${addition}`), /preservation/);
  }
});

test('unformatted shell commands and error lines stay exact', async () => {
  const original = 'Run npm test -- --runInBand before deploying.\nError: Cannot find module widgets';
  assert.equal(await rewriteText(original, async (masked) => {
    assert.ok(!masked.includes('npm test'));
    assert.ok(!masked.includes('Cannot find module'));
    return masked.replace('Run', 'Please run');
  }), original.replace('Run', 'Please run'));
});

test('unclosed code and longer closing fences are protected', async () => {
  for (const code of ['```sh\nsecret code', '````sh\nsecret code\n`````']) {
    assert.equal(await rewriteText('Done.\n' + code, async (masked) => {
      assert.equal(masked.includes('secret code'), false);
      return masked;
    }), 'Done.\n' + code);
  }
});
