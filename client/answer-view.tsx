import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import type { Configuration, RewriteResult } from '../shared/contracts';
import { Markdown } from './markdown';

export function Button({ label, onPress, theme, disabled = false, expanded }: { label: string; onPress: () => void; theme: PluginTheme; disabled?: boolean; expanded?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text></Pressable>;
}

export function AnswerView({ original, result, theme, compact, defaultDisplay, onRewrite, onCopy }: {
  original: string; result: RewriteResult; theme: PluginTheme; compact: boolean;
  defaultDisplay: Configuration['display']; onRewrite?: () => void; onCopy?: (text: string) => void;
}) {
  const [selected, select] = useState<Configuration['display']>();
  const [expanded, expand] = useState(false);
  const choose = (display: Configuration['display']) => { select(display); expand(false); };
  const mode = selected ?? defaultDisplay;
  const rewritten = result.status === 'ready' && result.text ? result.text : null;
  const showOriginal = !rewritten || mode !== 'rewrite';
  const showRewrite = !!rewritten && mode !== 'original';
  return <View style={{ gap: compact ? 8 : 10 }}>
    {showOriginal && <View style={{ gap: 5 }}>{showRewrite && <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Original</Text>}<Markdown text={original} theme={theme} /></View>}
    {showRewrite && <View style={{ gap: 5 }}>{showOriginal && <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Rewrite</Text>}<Markdown text={rewritten!} theme={theme} /></View>}
    {result.status !== 'disabled' && <View style={{ gap: 5 }}>
      {expanded && <View style={{ gap: 5 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{rewritten ? 'Paseo Plain · display only' : result.status === 'pending' ? 'Rewriting… Original shown above.' : result.reason ?? 'Original · not rewritten'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {rewritten && <><Button label="Show original" theme={theme} onPress={() => choose('original')} /><Button label="Show rewrite" theme={theme} onPress={() => choose('rewrite')} /><Button label="Compare" theme={theme} onPress={() => choose('compare')} /></>}
          {!rewritten && result.status !== 'pending' && onRewrite && <Button label="Rewrite" theme={theme} onPress={() => { onRewrite(); expand(false); }} />}
          {onCopy && <Button label="Copy original" theme={theme} onPress={() => { onCopy(original); expand(false); }} />}
          {onCopy && rewritten && <Button label="Copy rewrite" theme={theme} onPress={() => { onCopy(rewritten); expand(false); }} />}
        </View>
      </View>}
      <View style={{ alignItems: 'flex-start' }}><Button label="Plain English" theme={theme} expanded={expanded} onPress={() => expand(!expanded)} /></View>
    </View>}
  </View>;
}
