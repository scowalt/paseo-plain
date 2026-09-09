import { Component, type ReactNode } from 'react';
import { Text } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgent, usePaseo, useRpc, type PluginTimelineItemProps } from '@getpaseo/plugin/client';
import { copyText } from '@getpaseo/plugin/client/react-native';
import { readConfiguration, lookupRewrite, requestRewrite, type RewriteResult } from '../shared/contracts';
import { AnswerView } from './answer-view';
import { placeAnswerBlock, readWholeAnswer } from './whole-answer';

type Props = PluginTimelineItemProps<{ original: string; messageId: string | null }>;
class OriginalBoundary extends Component<{ children: ReactNode; original: string; color: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Text selectable style={{ color: this.props.color }}>{this.props.original}</Text> : this.props.children; }
}

export function Answer(props: Props) {
  return <OriginalBoundary original={props.item.data.original} color={props.theme.colors.foreground}><ConnectedAnswer {...props} /></OriginalBoundary>;
}

function ConnectedAnswer({ agentId, item, theme, layout }: Props) {
  const { original: fragment, messageId } = item.data;
  const paseo = usePaseo();
  const configuration = useRpc(readConfiguration), lookup = useRpc(lookupRewrite), rewrite = useRpc(requestRewrite);
  const client = useQueryClient();
  const status = useAgent(agentId, (agent) => agent.status);
  const settings = useQuery({ queryKey: ['plain', 'configuration'], queryFn: () => configuration({}), refetchInterval: 5000, retry: false });
  const enabled = !!settings.data?.values.enabled && status === 'idle';
  const source = useQuery({
    queryKey: ['plain', 'source', agentId, messageId],
    queryFn: ({ signal }) => readWholeAnswer({ refetch: (options) => client.fetchQuery({
      queryKey: ['plain', 'source-page', agentId, options],
      queryFn: () => paseo.agents.ref(agentId).timeline.refetch(options),
      staleTime: 1000, gcTime: 10000,
    }) }, messageId!, signal),
    enabled: enabled && !!messageId, retry: false,
    refetchInterval: (query) => query.state.data === null && query.state.dataUpdateCount < 5 ? 2000 : false,
  });
  const placement = placeAnswerBlock(fragment, enabled && !source.isError ? source.data : null);
  const original = placement === 'whole' ? source.data!.original : fragment;
  const key = ['plain', 'answer', agentId, original, settings.data?.revision];
  const eligible = enabled && placement === 'whole';
  const result = useQuery({
    queryKey: key, queryFn: () => lookup({ agentId, original }), enabled: eligible && status === 'idle', retry: false,
    refetchInterval: (query) => query.state.data?.status === 'pending' ? 1000 : query.state.data?.status === 'uncached' && query.state.dataUpdateCount < 5 ? 2000 : false,
  });
  const action = useMutation({
    mutationFn: (request: { agentId: string; original: string; revision?: number }) => rewrite({ agentId: request.agentId, original: request.original }),
    onSuccess: (data, request) => client.setQueryData(['plain', 'answer', request.agentId, request.original, request.revision], data), retry: false,
  });
  const fallback: RewriteResult = { status: 'failed', reason: 'Rewrite service unavailable. Showing the original.' };
  // 0.8 beta does not mark assistant-text streaming reliably. Busy agents show originals.
  const visible = !eligible || status !== 'idle' ? { status: 'disabled' as const } : result.isError || action.isError ? fallback : result.data ?? { status: 'uncached' as const };
  if (placement === 'hidden') return null;
  return <OriginalBoundary key={original} original={original} color={theme.colors.foreground}>
    <AnswerView key={original} original={original} result={visible} theme={theme} compact={layout.compact} defaultDisplay={settings.data?.values.display ?? 'original'} onRewrite={eligible && !action.isPending ? () => action.mutate({ agentId, original, revision: settings.data?.revision }) : undefined} onCopy={(text) => { void copyText(text).catch(() => {}); }} />
  </OriginalBoundary>;
}
