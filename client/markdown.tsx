import { useMemo, useState, type ReactNode } from 'react';
import { Text, View, ScrollView, Platform, type TextStyle } from 'react-native';
import { Lexer, type Token, type Tokens } from 'marked';
import type { PluginTheme } from '@getpaseo/plugin';
import { isExternalLink, MarkdownLink } from './markdown-link';

const hasLink = (tokens: Token[] | undefined): boolean => tokens?.some(token =>
  token.type === 'link' && isExternalLink(token.href) || 'tokens' in token && hasLink(token.tokens),
) ?? false;
// Selectable parent Text can consume nested link taps on iOS. Keep selection on
// other paragraphs/platforms; whole-answer Copy remains available everywhere.
const selectable = (tokens: Token[] | undefined) => Platform.OS !== 'ios' || !hasLink(tokens);
type Inline = (tokens: Token[] | undefined, fallback?: string, color?: string) => ReactNode;

/** Native-only Markdown. Replace this module when Paseo exposes a public renderer.
 * No HTML execution, automatic remote images, or private host imports.
 */
export function Markdown({ text, theme, compact = false }: { text: string; theme: PluginTheme; compact?: boolean }) {
  const tokens = useMemo(() => Lexer.lex(text), [text]);
  // Paseo 0.8 defaults. PluginTheme only exposes colors, not Appearance settings.
  // On web inherit the app's font instead of RN Web's default Arial stack.
  const normal: TextStyle = { color: theme.colors.foreground, fontSize: 15, lineHeight: 21, ...(Platform.OS === 'web' ? { fontFamily: 'inherit' } : {}) };
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const inline: Inline = (items, fallback = '', color = theme.colors.foreground) => items?.map((token, i) => {
    switch (token.type) {
      case 'strong': return <Text key={i} style={{ color, fontWeight: '500' }}>{inline(token.tokens, token.text, color)}</Text>;
      case 'em': return <Text key={i} style={{ color, fontStyle: 'italic' }}>{inline(token.tokens, token.text, color)}</Text>;
      case 'del': return <Text key={i} style={{ color, textDecorationLine: 'line-through' }}>{inline(token.tokens, token.text, color)}</Text>;
      case 'codespan': return <Text key={i} style={{ color, fontFamily: mono, backgroundColor: theme.colors.surface1 }}>{token.text}</Text>;
      case 'link': {
        const linkColor = isExternalLink(token.href) ? theme.colors.accent : color;
        return <MarkdownLink key={i} href={token.href} color={linkColor}>{inline(token.tokens, token.text, linkColor)}</MarkdownLink>;
      }
      case 'image': return token.text; // Alt text only; viewing never fetches an image.
      case 'br': return '\n';
      case 'escape': return token.text;
      case 'text': return token.tokens ? inline(token.tokens, token.text, color) : token.text;
      default: return token.raw;
    }
  }) ?? fallback;
  const blocks = (items: Token[]): ReactNode => items.map((token, i) => {
    switch (token.type) {
      case 'space': return null;
      case 'heading': {
        const size = Math.round(15 * ([26, 22, 20, 18, 16, 16][token.depth - 1] / 14));
        return <Text selectable={selectable(token.tokens)} accessibilityRole="header" key={i} style={{ ...normal, fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: token.depth <= 2 ? '700' : '600' }}>{inline(token.tokens, token.text)}</Text>;
      }
      case 'paragraph': case 'text': return <Text selectable={selectable(token.tokens)} key={i} style={normal}>{inline(token.tokens, token.text)}</Text>;
      case 'code': return <ScrollView horizontal key={i} style={{ flexGrow: 0, backgroundColor: theme.colors.surface1, borderRadius: 6 }} contentContainerStyle={{ padding: 10 }}><Text selectable style={{ ...normal, fontFamily: mono, fontSize: 12 }}>{token.text}</Text></ScrollView>;
      case 'table': return <MarkdownTable key={i} token={token as Tokens.Table} theme={theme} compact={compact} normal={normal} inline={inline} />;
      case 'list': return <View key={i} style={{ gap: 5 }}>{token.items.map((item: Tokens.ListItem, n: number) => <View key={n} style={{ flexDirection: 'row', gap: 8 }}><Text style={normal}>{token.ordered ? `${Number(token.start) + n}.` : '•'}{item.task ? item.checked ? ' ☑' : ' ☐' : ''}</Text><View style={{ flex: 1, minWidth: 0, gap: 4 }}>{blocks(item.tokens)}</View></View>)}</View>;
      case 'blockquote': return <View key={i} style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 12, gap: 6 }}>{token.tokens ? blocks(token.tokens) : <Text selectable style={normal}>{token.raw}</Text>}</View>;
      case 'hr': return <View key={i} role="separator" style={{ borderBottomWidth: 1, borderColor: theme.colors.border }} />;
      default: return <Text selectable key={i} style={normal}>{token.raw}</Text>;
    }
  });
  return <View style={{ gap: 12, minWidth: 0 }}>{blocks(tokens)}</View>;
}

function MarkdownTable({ token, theme, compact, normal, inline }: {
  token: Tokens.Table; theme: PluginTheme; compact: boolean; normal: TextStyle; inline: Inline;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const width = Math.max(availableWidth, token.header.length * (compact ? 160 : 200));
  return <ScrollView horizontal style={{ flexGrow: 0, maxWidth: '100%' }} onLayout={({ nativeEvent }) => setAvailableWidth(nativeEvent.layout.width)}>
    <View role="table" style={{ width, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, overflow: 'hidden' }}>
      {[token.header, ...token.rows].map((row, r) => <View key={r} role="row" style={{ flexDirection: 'row', backgroundColor: r === 0 ? theme.colors.surface1 : theme.colors.surface0, ...(r > 0 ? { borderTopWidth: 1, borderColor: theme.colors.border } : {}) }}>
        {row.map((cell, c) => <Text key={c} role={r === 0 ? 'columnheader' : 'cell'} selectable={selectable(cell.tokens)} style={{ ...normal, flex: 1, minWidth: 0, padding: 10, textAlign: token.align[c] ?? 'left', ...(r === 0 ? { fontWeight: '600' } : {}), ...(c > 0 ? { borderLeftWidth: 1, borderColor: theme.colors.border } : {}) }}>{inline(cell.tokens, cell.text)}</Text>)}
      </View>)}
    </View>
  </ScrollView>;
}
