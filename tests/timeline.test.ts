import assert from 'node:assert/strict';
import test from 'node:test';
import { transformAssistant } from '../client/timeline.ts';

test('a Pi answer gets a display wrapper without changing the source message', () => {
  const original = Object.freeze({ type: 'assistant_message' as const, text: 'The update completed.', messageId: 'pi-1' });
  assert.deepEqual(transformAssistant({ item: original, phase: 'complete' }), {
    items: [{ type: 'plugin', kind: 'plain-answer', version: 1, data: { original: 'The update completed.', messageId: 'pi-1' } }],
  });
  assert.equal(original.text, 'The update completed.');
});
