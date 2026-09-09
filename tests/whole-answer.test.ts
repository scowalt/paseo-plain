import assert from 'node:assert/strict';
import test from 'node:test';
import { placeAnswerBlock, readWholeAnswer, splitAnswerBlocks } from '../client/whole-answer';

const signal = () => new AbortController().signal;
const page = (text: string, messageId = 'm') => ({ entries: [{ item: { type: 'assistant_message', messageId, text } }], agent: { status: 'idle' }, hasOlder: false, error: null });
const timeline = (data: object) => ({ refetch: async () => data }) as any;

test('Markdown blocks keep code, lists, tables, and quotes intact and place the whole answer at the tail', async () => {
  for (const middle of [
    '```text\nLine one\n\nLine two\n```',
    '- First\n\n- Second',
    '> First\n>\n> Second',
    '| One | Two |\n| --- | --- |\n| A | B |',
  ]) {
    const parts = ['Intro.', middle, 'Conclusion.'];
    const original = parts.join('\n\n') + '\n\n';
    assert.deepEqual(splitAnswerBlocks(original), parts);
    const whole = await readWholeAnswer(timeline(page(original)), 'm', signal());
    assert.deepEqual(parts.map((part) => placeAnswerBlock(part, whole)), ['hidden', 'hidden', 'whole']);
    assert.equal(placeAnswerBlock('Conclusion.\n\n', whole), 'whole');
    assert.equal(placeAnswerBlock(original, whole), 'whole');
    assert.equal(whole?.original, original, 'retain exact whitespace for cache and copy');
  }
});

test('ambiguous tail blocks remain fully visible because this SDK supplies no block index', async () => {
  const parts = ['Repeated.', 'Middle.', 'Repeated.'];
  const original = parts.join('\n\n');
  const whole = await readWholeAnswer(timeline(page(original)), 'm', signal());
  assert.deepEqual(parts.map((part) => placeAnswerBlock(part, whole)), ['original', 'original', 'original']);
  assert.equal(placeAnswerBlock(original, whole), 'whole', 'an unsplit restored answer is unambiguous');
  assert.equal(placeAnswerBlock('Unknown fragment.', whole), 'original');
});

test('source lookup pages through history but never merges reused IDs across tool calls', async () => {
  let calls = 0;
  const reader = { refetch: async () => ++calls === 1 ? { ...page('Newer.', 'new'), hasOlder: true, startCursor: { epoch: 'e', seq: 1 } } : page('Older.') } as any;
  assert.equal((await readWholeAnswer(reader, 'm', signal()))?.original, 'Older.');
  assert.equal(calls, 2);
  const reused = { ...page('Before.'), entries: [...page('Before.').entries, { item: { type: 'tool_call' } }, ...page('After.').entries] };
  assert.equal(await readWholeAnswer(timeline(reused), 'm', signal()), null);
});

test('unavailable, busy, oversized, canceled, and out-of-budget history stays original', async () => {
  for (const data of [{ ...page('Answer.'), error: 'Unavailable' }, { ...page('Answer.'), agent: { status: 'running' } }, page('x'.repeat(32001)), page('Other.', 'other')]) {
    assert.equal(await readWholeAnswer(timeline(data), 'm', signal()), null);
  }
  const controller = new AbortController(); controller.abort();
  assert.equal(await readWholeAnswer({ refetch: async () => { throw new Error('must not fetch'); } }, 'm', controller.signal), null);
  let calls = 0;
  const reader = { refetch: async () => { calls++; return { ...page('Other.', 'other'), hasOlder: true, startCursor: { epoch: 'e', seq: calls } }; } } as any;
  assert.equal(await readWholeAnswer(reader, 'm', signal()), null);
  assert.equal(calls, 5);
  assert.equal(placeAnswerBlock('Keep this.', null), 'original');
});
