import { useMemo, type ReactNode } from 'react';
import { Text, View, ScrollView, Linking } from 'react-native';
import { Lexer, type Token } from 'marked';
import type { PluginTheme } from '@getpaseo/plugin';

/** Native-only Markdown, with no HTML execution or automatic remote image loads. */
export function Markdown({ text, theme }: { text: string; theme: PluginTheme }) {
  const tokens = useMemo(() => Lexer.lex(text), [text]);
  const normal = { color: theme.colors.foreground, fontSize: 15, lineHeight: 23 };
  const inline = (items: Token[] | undefined, fallback = ''): ReactNode => items?.map((token, i) => {
    switch (token.type) {
      case 'strong': return <Text key={i} style={{ color: normal.color, fontWeight: '700' }}>{inline(token.tokens, token.text)}</Text>;
      case 'em': return <Text key={i} style={{ color: normal.color, fontStyle: 'italic' }}>{inline(token.tokens, token.text)}</Text>;
      case 'codespan': return <Text key={i} style={{ color: normal.color, fontFamily: 'monospace', backgroundColor: theme.colors.surface1 }}>{token.text}</Text>;
      case 'link': return <Text key={i} style={{ color: theme.colors.accent, textDecorationLine: 'underline' }} onPress={/^https?:\/\//i.test(token.href) ? () => { void Linking.openURL(token.href).catch(() => {}); } : undefined}>{inline(token.tokens, token.text)}</Text>;
      case 'br': return '\n';
      case 'text': return token.tokens ? inline(token.tokens, token.text) : token.text;
      default: return token.raw;
    }
  }) ?? fallback;
  const blocks = (items: Token[]): ReactNode => items.map((token, i) => {
    switch (token.type) {
      case 'space': return null;
      case 'heading': return <Text selectable key={i} style={{ ...normal, fontSize: 19, fontWeight: '700' }}>{inline(token.tokens, token.text)}</Text>;
      case 'paragraph': case 'text': return <Text selectable key={i} style={normal}>{inline(token.tokens, token.text)}</Text>;
      case 'code': return <ScrollView horizontal key={i} style={{ backgroundColor: theme.colors.surface1, borderRadius: 6 }} contentContainerStyle={{ padding: 10 }}><Text selectable style={{ ...normal, fontFamily: 'monospace', fontSize: 13 }}>{token.text}</Text></ScrollView>;
      case 'list': return <View key={i} style={{ gap: 5 }}>{token.items.map((item: { tokens: Token[] }, n: number) => <View key={n} style={{ flexDirection: 'row', gap: 8 }}><Text style={normal}>{token.ordered ? `${Number(token.start) + n}.` : '•'}</Text><View style={{ flex: 1, gap: 4 }}>{blocks(item.tokens)}</View></View>)}</View>;
      case 'blockquote': return <View key={i} style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 12, gap: 6 }}>{token.tokens ? blocks(token.tokens) : <Text selectable style={normal}>{token.raw}</Text>}</View>;
      default: return <Text selectable key={i} style={normal}>{token.raw}</Text>;
    }
  });
  return <View style={{ gap: 10 }}>{blocks(tokens)}</View>;
}
