import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PluginTheme } from '@getpaseo/plugin';
// Exercise actual React Native Web output; only the external Paseo host is fake.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native') return next('react-native-web', context);
  if (specifier === '@getpaseo/plugin/client/react-native') return { url: new URL('./host.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { AnswerView } = await import('../client/answer-view.tsx');
const theme = { colors: { foreground: '#fff', foregroundMuted: '#bbb', surface0: '#111', surface1: '#222', border: '#333', accent: '#acf' } } as PluginTheme;

test('real RN Web emits usable anchors inside a structured table, not clickable spans or raw Markdown', () => {
  const original = '| Direction | More |\n|---|---|\n| **North** | [**Guide**](https://example.com/guide?q=1#part) |';
  const html = renderToStaticMarkup(React.createElement(AnswerView, {
    original, result: { status: 'uncached' }, theme, compact: true, defaultDisplay: 'original',
  }));
  assert.match(html, /role="table"/);
  assert.equal(html.match(/role="row"/g)?.length, 2);
  assert.equal(html.match(/role="columnheader"/g)?.length, 2);
  assert.equal(html.match(/role="cell"/g)?.length, 2);
  const anchor = html.match(/<a\b[^>]*>/)?.[0];
  assert.ok(anchor, 'real RN Web must emit an anchor, not just a Text onPress callback');
  assert.match(anchor, /href="https:\/\/example.com\/guide\?q=1#part"/);
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
  assert.ok(!html.includes('**North**') && !html.includes('|---|'));
});
