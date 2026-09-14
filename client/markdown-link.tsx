import type { ReactNode } from 'react';
import { Linking, Platform, Text } from 'react-native';
import { useToast } from '@getpaseo/plugin/client/react-native';

/** Match Paseo's external-link scheme policy. Daemon paths are not client URLs. */
export function isExternalLink(href: string): boolean {
  return /^https?:\/\/[^/?#\\\s]+(?:[/?#][^\s\\]*)?$/i.test(href) && !/[\u0000-\u001f\u007f]/.test(href);
}

export function MarkdownLink({ href, color, children }: { href: string; color: string; children: ReactNode }) {
  const toast = useToast();
  if (!isExternalLink(href)) return <>{children}</>;
  const open = async () => {
    try { await Linking.openURL(href); }
    catch { toast.error('Could not open the link. Use Copy original or Copy rewrite to copy its address.'); }
  };
  // RN Web's Text renders an anchor when href is supplied. Do not intercept its
  // default action: keyboard activation, middle-click and Copy Link need an href.
  // These RN Web props are intentionally absent on native clients.
  const destination = Platform.OS === 'web'
    ? { href, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
    : { onPress: open };
  return <Text {...destination} accessibilityRole="link" style={{ color, textDecorationLine: 'underline' }}>{children}</Text>;
}
