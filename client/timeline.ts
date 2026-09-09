import type { PluginTimelineTransformerContribution } from '@getpaseo/plugin/client';

export const transformAssistant: PluginTimelineTransformerContribution<'assistant_message'>['transform'] = ({ item }) => ({
  items: [{ type: 'plugin', kind: 'plain-answer', version: 1, data: {
    original: item.text,
    messageId: item.messageId ?? null,
  } }],
});
