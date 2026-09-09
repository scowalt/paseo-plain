import type { PluginServerContext } from '@getpaseo/plugin/server';
import { readConfiguration, saveConfiguration, lookupRewrite, requestRewrite, clearCache, previewRewrite } from '../shared/contracts';
import type { createRewriteService } from './service';

export function registerServer(server: PluginServerContext, service: ReturnType<typeof createRewriteService>) {
  server.handle(readConfiguration, () => service.configuration());
  server.handle(saveConfiguration, (input) => service.configure(input));
  server.handle(lookupRewrite, (input) => service.lookup(input));
  server.handle(clearCache, () => service.clear());
  server.handle(requestRewrite, async (input, { paseo }) => {
    const current = await paseo.agents.ref(input.agentId).refresh();
    if (!current || current.agent.status !== 'idle') return { status: 'failed' as const, reason: 'Wait until the agent finishes. Showing the original.' };
    return service.enqueue(input);
  });
  server.handle(previewRewrite, async ({ original }) => service.enqueue({ agentId: 'plain-preview', original }));
  // Model work is reachable only from the two explicit action RPCs above.
  // Lifecycle hooks cancel work; completing a turn never starts a rewrite.
  const cleanups = [
    server.on('agent.turn_started', ({ agent }) => service.cancelAgent(agent.id)),
    server.on('agent.archived', ({ agent }) => service.cancelAgent(agent.id)),
  ];
  return async () => { for (const cleanup of cleanups) cleanup(); await service.dispose(); };
}
