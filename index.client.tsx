import type { PluginClientContext } from '@getpaseo/plugin/client';
import { answerSchema, readConfiguration } from './shared/contracts';
import { Answer } from './client/answer';
import { Settings } from './client/settings';
import { transformAssistant } from './client/timeline';

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addTimelineRenderer({ kind: 'plain-answer', version: 1, schema: answerSchema, Component: Answer }),
    client.addSettingsScreen({ id: 'settings', title: 'Paseo Plain', icon: 'MessageCircle', Component: Settings }),
    client.addSurface('settings', Settings),
    client.addSidebarItem({ id: 'plain', title: 'Paseo Plain', icon: 'MessageCircle', surface: 'settings' }),
    client.addCommandCenterItem({ id: 'settings', title: 'Paseo Plain settings', icon: 'MessageCircle', context: 'global', onSelect: ({ openSettings }) => openSettings('settings') }),
  ];
  let stopTransform: (() => void) | undefined, stopped = false, checking = false;
  const sync = async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      const config = await client.rpc(readConfiguration, {});
      if (stopped) return;
      if (config.values.enabled && !stopTransform) stopTransform = client.addTimelineTransformer({ id: 'plain-answers', query: { itemType: 'assistant_message' }, transform: transformAssistant });
      else if (!config.values.enabled) { stopTransform?.(); stopTransform = undefined; }
    } catch { stopTransform?.(); stopTransform = undefined; }
    finally { checking = false; }
  };
  void sync();
  const timer = setInterval(() => { void sync(); }, 5000);
  return () => { stopped = true; clearInterval(timer); stopTransform?.(); for (const cleanup of cleanups) cleanup(); };
}
