import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginTheme } from '@getpaseo/plugin';
import { configSchema } from '../shared/contracts';
import { transformAssistant } from '../client/timeline';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native') return { url: new URL('./native.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === '@getpaseo/plugin/client' || specifier === '@getpaseo/plugin/client/react-native') return { url: new URL('./host.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { Answer } = await import('../client/answer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const theme = { colors: { foreground: '#fff', foregroundMuted: '#bbb', surface0: '#111', surface1: '#222', border: '#333', accent: '#acf' } } as PluginTheme;

// Paseo 0.8 beta's promoteCompletedAssistantBlocks + sourceTimelineItem retain
// messageId but pass each Markdown block separately to the public transformer.
const blocks = ['The custom prompt combines preservation rules with this instruction:', '```text\nUse everyday words.\n```', 'The editable instruction is in settings.', 'This is our custom prompt.'];
const original = blocks.join('\n\n');
const rewritten = original.replace('combines preservation rules with this instruction', 'uses these rules');

test('one whole answer has one bottom button, not a control group after each Markdown block', async () => {
  const calls: { name: string; input: any }[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  (globalThis as any).plainTestHost = {
    status: 'idle',
    rpc: async (name: string, input: any) => {
      calls.push({ name, input });
      if (name === 'plain.configuration') return { values: configSchema.parse({ enabled: true }), revision: 1, error: null };
      if (name === 'plain.lookup' || name === 'plain.rewrite') return input.original === original ? { status: 'ready', text: rewritten } : { status: 'uncached' };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    paseo: { agents: { ref: () => ({ timeline: { refetch: async () => ({
      entries: [{ item: { type: 'assistant_message', messageId: 'pi-answer', text: original } }],
      agent: { status: 'idle' }, hasOlder: false, error: null,
    }) } }) } },
  };
  const source = blocks.map((text) => Object.freeze({ type: 'assistant_message' as const, messageId: 'pi-answer', text }));
  const children = source.map((item, index) => {
    const transformed = transformAssistant({ item, phase: 'complete' })!;
    return React.createElement(Answer, { key: index, agentId: 'pi-agent', timestamp: new Date(0), host: { id: 'test-host', label: 'Test host' },
      theme, layout: { compact: true, platform: 'web' }, item: transformed.items[0] as any });
  });
  let view!: ReactTestRenderer;
  try {
    await act(async () => { view = create(React.createElement(QueryClientProvider, { client }, children)); });
    for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const buttons = view.root.findAllByProps({ accessibilityRole: 'button' });
    assert.equal(buttons.length, 1, 'one collapsed action button for the entire answer');
    const json = JSON.stringify(view.toJSON());
    assert.ok(json.includes('This is our custom prompt.'));
    assert.ok(json.lastIndexOf('This is our custom prompt.') < json.indexOf('"accessibilityRole":"button"'), 'control follows the last paragraph');
    assert.ok(calls.filter((call) => call.name === 'plain.lookup').every((call) => call.input.original === original), 'cache queries use the whole answer, never Markdown fragments');
    assert.deepEqual(source.map((item) => item.text), blocks, 'source history is unchanged');
    assert.ok(json.includes('uses these rules'), 'the whole-message cached rewrite is used');
    assert.equal(calls.filter((call) => ['plain.rewrite', 'plain.preview'].includes(call.name)).length, 0, 'viewing an answer never requests model work');
    await act(async () => view.root.findByProps({ accessibilityLabel: 'Plain English' }).props.onPress());
    await act(async () => view.root.findByProps({ accessibilityLabel: 'Show original' }).props.onPress());
    assert.equal(view.root.findAllByProps({ accessibilityRole: 'button' }).length, 1);
    assert.ok(JSON.stringify(view.toJSON()).includes('combines preservation rules'));
    await act(async () => view.root.findByProps({ accessibilityLabel: 'Plain English' }).props.onPress());
    await act(async () => view.root.findByProps({ accessibilityLabel: 'Copy original' }).props.onPress());
    assert.equal((globalThis as any).plainTestHost.copied, original, 'copy returns the whole original, not its last paragraph');
    assert.equal(calls.filter((call) => ['plain.rewrite', 'plain.preview'].includes(call.name)).length, 0, 'opening controls, changing display, and copying are free of model calls');
  } finally {
    if (view) await act(async () => view.unmount());
    client.clear();
    delete (globalThis as any).plainTestHost;
  }
});

test('grouped answers preserve every block on pending work, failure, streaming, and history errors', async () => {
  for (const compact of [false, true]) for (const state of ['uncached', 'pending', 'failed', 'running', 'source-error']) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const calls: any[] = [];
    const host = {
      status: state === 'running' ? 'running' : 'idle',
      rpc: async (name: string, input: any) => {
        if (name === 'plain.configuration') return { values: configSchema.parse({ enabled: true }), revision: 1, error: null };
        if (name === 'plain.rewrite') { calls.push(input); return { status: 'ready', text: rewritten }; }
        return { status: state };
      },
      paseo: { agents: { ref: () => ({ timeline: { refetch: async () => {
        if (state === 'source-error') throw new Error('Unavailable');
        return { entries: [{ item: { type: 'assistant_message', messageId: 'pi-answer', text: original } }], agent: { status: 'idle' }, hasOlder: false, error: null };
      } } }) } },
    };
    (globalThis as any).plainTestHost = host;
    const render = () => React.createElement(QueryClientProvider, { client }, blocks.map((text, i) => React.createElement(Answer, {
      key: i, agentId: 'pi-agent', timestamp: new Date(0), host: { id: 'test-host', label: 'Test host' }, theme, layout: { compact, platform: 'web' },
      item: transformAssistant({ item: { type: 'assistant_message', text, messageId: 'pi-answer' }, phase: 'complete' })!.items[0] as any,
    })));
    const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };
    let view!: ReactTestRenderer;
    try {
      await act(async () => { view = create(render()); });
      await settle();
      const text = JSON.stringify(view.toJSON());
      for (const paragraph of [blocks[0], 'Use everyday words.', blocks[2], blocks[3]]) {
        assert.equal(text.split(paragraph).length - 1, 1, `${state}: each block remains visible exactly once`);
      }
      assert.equal(view.root.findAllByProps({ accessibilityRole: 'button' }).length, ['running', 'source-error'].includes(state) ? 0 : 1);
      assert.deepEqual(calls, [], 'viewing an uncached answer never requests model work');
      if (state === 'uncached') {
        await act(async () => view.root.findByProps({ accessibilityLabel: 'Plain English' }).props.onPress());
        await act(async () => view.root.findByProps({ accessibilityLabel: 'Rewrite' }).props.onPress());
        await settle();
        assert.deepEqual(calls, [{ agentId: 'pi-agent', original }], 'manual rewrite sends the whole answer once');
        assert.equal(view.root.findAllByProps({ accessibilityRole: 'button' }).length, 1);
      }
      if (state === 'running') {
        host.status = 'idle';
        host.rpc = async (name: string) => name === 'plain.configuration' ? { values: configSchema.parse({ enabled: true }), revision: 1, error: null } : { status: 'ready', text: rewritten };
        await act(async () => view.update(render()));
        await settle();
        assert.equal(view.root.findAllByProps({ accessibilityRole: 'button' }).length, 1, 'the completed streamed answer gains just one button');
        assert.ok(JSON.stringify(view.toJSON()).includes('uses these rules'));
      }
    } finally {
      if (view) await act(async () => view.unmount());
      client.clear(); delete (globalThis as any).plainTestHost;
    }
  }
});
