import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginTheme } from '@getpaseo/plugin';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native') return { url: new URL('./native.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === '@getpaseo/plugin/client/react-native') return { url: new URL('./host.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { AnswerView } = await import('../client/answer-view.tsx');
const native = await import('./native.mjs' as string);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const themes = [
  { colors: { foreground: '#fff', foregroundMuted: '#bbb', surface0: '#111', surface1: '#222', border: '#333', accent: '#acf' } },
  { colors: { foreground: '#111', foregroundMuted: '#444', surface0: '#fff', surface1: '#eee', border: '#ccc', accent: '#057' } },
] as PluginTheme[];
const table = '| Direction | Reason | Cost |\n|:---|:---:|---:|\n| **North** | [Guide](https://example.com/guide) | `10` |\n| South | A \\| B | 20 |';
const textOf = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
const textStyle = (node: ReactTestInstance) => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

async function display(original: string, run: (view: ReactTestRenderer) => Promise<void> | void, options: { compact?: boolean; theme?: PluginTheme; rewrite?: boolean } = {}) {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(React.createElement(AnswerView, {
    original: options.rewrite ? 'Original answer.' : original,
    result: options.rewrite ? { status: 'ready', text: original } : { status: 'uncached' },
    theme: options.theme ?? themes[0], compact: options.compact ?? false, defaultDisplay: options.rewrite ? 'rewrite' : 'original',
  })); });
  try { await run(view); } finally { await act(async () => view.unmount()); }
}

test('originals and rewrites render aligned tables with formatted cells in both layouts and themes', async () => {
  for (const compact of [false, true]) for (const theme of themes) for (const rewrite of [false, true]) {
    await display(table, async (view) => {
      assert.equal(view.root.findAllByProps({ role: 'table' }).length, 1, 'table is not a raw text fallback');
      assert.equal(view.root.findAllByProps({ role: 'row' }).length, 3);
      const headings = view.root.findAllByProps({ role: 'columnheader' });
      const cells = view.root.findAllByProps({ role: 'cell' });
      assert.deepEqual(headings.map(textOf), ['Direction', 'Reason', 'Cost']);
      assert.deepEqual(cells.map(textOf), ['North', 'Guide', '10', 'South', 'A | B', '20']);
      assert.deepEqual(cells.slice(0, 3).map(node => textStyle(node).textAlign), ['left', 'center', 'right']);
      assert.ok(cells.every(node => textStyle(node).color === theme.colors.foreground));
      assert.ok(view.root.findAllByType(native.Text).some(node => textOf(node) === 'North' && Number(textStyle(node).fontWeight) >= 500));
      assert.equal(view.root.findByProps({ accessibilityRole: 'link' }).props.href, 'https://example.com/guide');
      const scroll = view.root.findByProps({ horizontal: true });
      await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { width: compact ? 320 : 1200 } } }));
      const width = textStyle(view.root.findByProps({ role: 'table' })).width;
      assert.ok(compact ? width > 320 : width === 1200, 'small clients scroll; wide tables use the available width');
    }, { compact, theme, rewrite });
  }
});

test('web links are actual anchors, including formatted labels, rather than JS-only presses', async () => {
  await display('[**Open _guide_**](https://example.com/guide?q=1#part)', view => {
    const link = view.root.findByProps({ accessibilityRole: 'link' });
    assert.equal(link.props.href, 'https://example.com/guide?q=1#part');
    assert.equal(link.props.hrefAttrs.target, '_blank');
    assert.match(link.props.hrefAttrs.rel, /noopener/);
    assert.match(link.props.hrefAttrs.rel, /noreferrer/);
    assert.equal(link.props.onPress, undefined, 'browser owns navigation, keyboard and modified clicks');
    assert.equal(textOf(link), 'Open guide');
    for (const node of link.findAllByType(native.Text)) assert.equal(textStyle(node).color, themes[0].colors.accent);
  });
});

test('native links open once, report failures without the URL, and do not conflict with iOS selection', async () => {
  try {
    for (const platform of ['ios', 'android']) {
      native.Platform.OS = platform;
      const opened: string[] = [], errors: string[] = [];
      (globalThis as any).plainTestOpenURL = async (url: string) => { opened.push(url); };
      (globalThis as any).plainTestToast = { error: (message: string) => errors.push(message) };
      await display('Read [**the guide**](https://example.com/private-link).\n\nSelectable paragraph.', async view => {
        const link = view.root.findByProps({ accessibilityRole: 'link' });
        assert.equal(link.props.href, undefined);
        await act(async () => { await link.props.onPress(); });
        assert.deepEqual(opened, ['https://example.com/private-link']);
        assert.equal(errors.length, 0);
        const paragraph = view.root.findAllByType(native.Text).find(node => textOf(node) === 'Read the guide.')!;
        assert.equal(paragraph.props.selectable, platform !== 'ios');
        assert.ok(view.root.findAllByType(native.Text).some(node => textOf(node) === 'Selectable paragraph.' && node.props.selectable));
        (globalThis as any).plainTestOpenURL = async () => { throw new Error('private provider detail'); };
        await act(async () => { await link.props.onPress(); });
        assert.equal(errors.length, 1);
        assert.ok(!errors[0].includes('example.com') && !errors[0].includes('private provider detail'));
      });
    }
  } finally {
    native.Platform.OS = 'web';
    delete (globalThis as any).plainTestOpenURL;
    delete (globalThis as any).plainTestToast;
  }
});

test('unsafe and daemon-local destinations stay inert, and images never load automatically', async () => {
  for (const platform of ['web', 'ios', 'android']) {
    native.Platform.OS = platform;
    try {
      await display('[script](javascript:alert%281%29) [file](file:///tmp/report.md) [relative](./report.md) [data](data:text/html,hello)\n\n![diagram](https://example.com/private.png)', view => {
        assert.equal(view.root.findAllByProps({ accessibilityRole: 'link' }).length, 0);
        assert.equal(view.root.findAll(node => String(node.type) === 'Image').length, 0);
        assert.ok(textOf(view.root).includes('diagram'));
      });
    } finally { native.Platform.OS = 'web'; }
  }
});

test('other Markdown keeps ordered tasks, nesting, inline code, quotes, and literal HTML', async () => {
  const original = '5. [x] Keep ~~old~~ **new** text.\n   - Use `npm test`.\n\n---\n\n> Read [guide](https://example.com/guide).\n\nEscaped \\*literal\\*.\n\n```html\n<script>doNotRun()</script>\n```';
  await display(original, view => {
    const visible = textOf(view.root);
    assert.ok(visible.includes('5. ☑'));
    assert.ok(visible.includes('Use npm test.'));
    assert.ok(visible.includes('Escaped *literal*.'));
    assert.ok(visible.includes('<script>doNotRun()</script>'));
    assert.equal(view.root.findAllByProps({ role: 'separator' }).length, 1);
    assert.equal(view.root.findByProps({ accessibilityRole: 'link' }).props.href, 'https://example.com/guide');
    assert.ok(view.root.findAllByType(native.Text).some(node => textOf(node) === 'old' && textStyle(node).textDecorationLine === 'line-through'));
    assert.ok(view.root.findAllByType(native.Text).some(node => textOf(node) === 'npm test' && textStyle(node).fontFamily === 'monospace'));
  });
});

test('prose uses Paseo default line spacing and web font inheritance, not a replacement font', async () => {
  await display('A paragraph.\n\n# Main heading\n\n### Smaller heading', view => {
    const paragraph = view.root.findAllByType(native.Text).find(node => textOf(node) === 'A paragraph.')!;
    assert.equal(textStyle(paragraph).fontSize, 15);
    assert.equal(textStyle(paragraph).lineHeight, 21);
    assert.equal(textStyle(paragraph).fontFamily, 'inherit');
    const headings = view.root.findAllByProps({ accessibilityRole: 'header' });
    assert.equal(headings.length, 2);
    assert.ok(textStyle(headings[0]).fontSize > textStyle(headings[1]).fontSize);
  });
});
