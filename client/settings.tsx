import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRpc, type PluginSurfaceProps } from '@getpaseo/plugin/client';
import { SettingsSection, SettingsSwitch, SettingsSelect } from '@getpaseo/plugin/client/ui';
import { readConfiguration, saveConfiguration, clearCache, previewRewrite, lookupRewrite, type Configuration, type RewriteResult } from '../shared/contracts';
import { AnswerView, Button } from './answer-view';

const example = 'The configuration change has been applied. I have not run the tests, so the fix is not yet verified.\n\nRun `npm test` before deploying.';

export function Settings({ theme, layout }: PluginSurfaceProps) {
  const read = useRpc(readConfiguration), save = useRpc(saveConfiguration), clear = useRpc(clearCache), preview = useRpc(previewRewrite), lookup = useRpc(lookupRewrite);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['plain', 'configuration'], queryFn: () => read({}), retry: false, refetchInterval: 5000 });
  const [draft, setDraft] = useState<{ values: Configuration; revision: number } | null>(null);
  const [previewText, setPreviewText] = useState(example), [requested, setRequested] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const write = useMutation({ mutationFn: save, onSuccess: (data) => { client.setQueryData(['plain', 'configuration'], data); if (!data.error) setDraft(null); }, retry: false });
  const erase = useMutation({ mutationFn: () => clear({}), onSuccess: () => { setRequested(null); void client.invalidateQueries({ queryKey: ['plain', 'answer'] }); }, retry: false });
  const run = useMutation({
    mutationFn: (input: { original: string; revision?: number }) => preview({ original: input.original }),
    onSuccess: (data, input) => { client.setQueryData(['plain', 'preview', input.original, input.revision], data); }, retry: false,
  });
  const result = useQuery({ queryKey: ['plain', 'preview', requested, query.data?.revision], queryFn: () => lookup({ agentId: 'plain-preview', original: requested! }), enabled: requested !== null, retry: false, refetchInterval: (q) => q.state.data?.status === 'pending' ? 1000 : false });
  const current = draft ?? query.data;
  const update = (patch: Partial<Configuration>) => { if (current) setDraft({ revision: current.revision, values: { ...current.values, ...patch } }); };
  const label = { color: theme.colors.foregroundMuted, fontSize: 13 };
  const inputStyle = { color: theme.colors.foreground, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 10 };
  return <View style={{ gap: 18, padding: layout.compact ? 12 : 20, backgroundColor: theme.colors.surface0 }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 20, fontWeight: '700' }}>Paseo Plain</Text>
    <Text style={label}>Rewrites only when you ask. Viewing answers never starts a model call. Your agents keep their original history. A separate Pi worker uses your OpenAI/Codex login, with no tools or project context.</Text>
    {!current ? <><Text style={label}>{query.isError ? 'Cannot reach the daemon. Originals remain unchanged.' : 'Loading settings…'}</Text><Button label="Reload settings" theme={theme} onPress={() => { void query.refetch(); }} /></> : <>
      <SettingsSection title="Rewriting">
        <SettingsSwitch label="Enable manual rewriting" hint="Use Plain English → Rewrite on an answer. This switch never enables automatic model calls." value={current.values.enabled} onValueChange={(enabled) => update({ enabled })} />
        <SettingsSelect label="Default view" value={current.values.display} options={[{ label: 'Rewrite', value: 'rewrite' }, { label: 'Original', value: 'original' }, { label: 'Compare', value: 'compare' }]} onValueChange={(display) => update({ display })} />
        <Text style={label}>Rewrite model · openai-codex</Text>
        <TextInput accessibilityLabel="Rewrite model" style={inputStyle} value={current.values.model} autoCapitalize="none" autoCorrect={false} onChangeText={(model) => update({ model })} />
        <Text style={label}>Voice instructions</Text>
        <TextInput accessibilityLabel="Voice instructions" multiline style={{ ...inputStyle, minHeight: 100 }} value={current.values.style} onChangeText={(style) => update({ style })} />
        <Text style={label}>Timeout · {current.values.timeoutSeconds} seconds</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button label={write.isPending ? 'Saving…' : 'Save settings'} theme={theme} disabled={write.isPending} onPress={() => write.mutate({ values: current.values, revision: current.revision })} /><Button label="Reload settings" theme={theme} onPress={() => { setDraft(null); void query.refetch(); }} /><Button label="Clear rewrite cache" theme={theme} disabled={erase.isPending} onPress={() => erase.mutate()} /></View>
        {(query.data?.error || write.isError || erase.isError) && <Text style={label}>{query.data?.error || 'The request failed. Your original messages are unchanged.'}</Text>}
        {write.isSuccess && !query.data?.error && <Text style={label}>Settings saved.</Text>}
        {erase.isSuccess && <Text style={label}>Rewrite cache cleared.</Text>}
      </SettingsSection>
      <SettingsSection title="Try it">
        <Text style={label}>The display test makes no model call. Test Pi rewrite sends the sample below to your selected model and uses your account allowance. Enable rewriting and save first.</Text>
        <TextInput accessibilityLabel="Rewrite sample" multiline style={{ ...inputStyle, minHeight: 130 }} value={previewText} onChangeText={(text) => { setPreviewText(text); setRequested(null); setDemo(false); }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button label="Display test (no model)" theme={theme} onPress={() => { setDemo(true); setRequested(null); }} /><Button label="Test Pi rewrite" theme={theme} disabled={!query.data?.values.enabled || run.isPending || !previewText.trim() || previewText.length > 8000} onPress={() => { setDemo(false); setRequested(previewText); run.mutate({ original: previewText, revision: query.data?.revision }); }} /></View>
        {demo && <AnswerView original="The operation completed." result={{ status: 'ready', text: 'It worked.' }} theme={theme} compact={layout.compact} defaultDisplay="compare" />}
        {!demo && (requested || run.isPending || run.isError) && <AnswerView key={requested ?? 'pending'} original={requested ?? previewText} result={run.isError || result.isError ? { status: 'failed', reason: 'Rewrite service unavailable. Showing the original.' } : result.data ?? { status: 'pending' } as RewriteResult} theme={theme} compact={layout.compact} defaultDisplay="compare" />}
      </SettingsSection>
    </>}
  </View>;
}
