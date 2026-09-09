import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginTheme } from '@getpaseo/plugin';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native') return { url: new URL('./native.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { AnswerView } = await import('../client/answer-view.tsx');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const theme = { colors: { foreground: '#fff', foregroundMuted: '#bbb', surface0: '#111', surface1: '#222', border: '#333', accent: '#acf' } } as PluginTheme;

test('the inline display can show rewrite, original, and both on compact screens', async () => {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(React.createElement(AnswerView, { original: 'The operation completed.', result: { status: 'ready', text: 'It worked.' }, theme, compact: true, defaultDisplay: 'rewrite' })); });
  const text = () => JSON.stringify(view.toJSON());
  assert.ok(text().includes('It worked.'));
  assert.ok(!text().includes('The operation completed.'));
  assert.equal(view.root.findAllByProps({ accessibilityRole: 'button' }).length, 1);
  await act(async () => view.root.findByProps({ accessibilityLabel: 'Plain English' }).props.onPress());
  await act(async () => view.root.findByProps({ accessibilityLabel: 'Show original' }).props.onPress());
  assert.ok(text().includes('The operation completed.'));
  assert.ok(!text().includes('It worked.'));
  assert.equal(view.root.findAllByProps({ accessibilityRole: 'button' }).length, 1);
  await act(async () => view.root.findByProps({ accessibilityLabel: 'Plain English' }).props.onPress());
  await act(async () => view.root.findByProps({ accessibilityLabel: 'Compare' }).props.onPress());
  assert.ok(text().includes('The operation completed.') && text().includes('It worked.'));
  await act(async () => view.unmount());
});

test('pending and failed rewrites show the original, never an empty replacement', async () => {
  for (const status of ['pending', 'failed', 'disabled', 'uncached'] as const) {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(React.createElement(AnswerView, { original: 'Keep reading this.', result: { status }, theme, compact: false, defaultDisplay: 'rewrite' })); });
    assert.ok(JSON.stringify(view.toJSON()).includes('Keep reading this.'));
    await act(async () => view.unmount());
  }
});
