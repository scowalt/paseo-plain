// Use the self-contained browser bundle: Paseo's neutral bundler does not resolve
// legacy package main fields in markdown-it's transitive dependencies.
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import type { PluginClientContext } from '@getpaseo/plugin/client';

type Timeline = Pick<ReturnType<PluginClientContext['paseo']['agents']['ref']>['timeline'], 'refetch'>;
export type WholeAnswer = { original: string; blocks: string[]; uniqueTail: boolean };
const parser = new MarkdownIt();

// Adapted from Paseo v0.8.0-beta.1, packages/app/src/utils/split-markdown-blocks.ts.
// Apache-2.0: see LICENSES/Paseo-Apache-2.0.txt. Preserve structural blank lines
// inside lists, quotes, and fences, just as the host's block promotion does.
export function splitAnswerBlocks(text: string): string[] {
  const lines = text.split('\n'), structural = new Set<number>();
  for (const token of parser.parse(text, {})) {
    if (token.level !== 0 || !token.map) continue;
    const [start, end] = token.map;
    for (let i = start; i < end - 1; i++) if (!lines[i]?.trim()) structural.add(i);
  }
  const blocks: string[] = [];
  let current: string[] = [], separator = false;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) {
      if (structural.has(index)) current.push(line);
      else if (current.length) separator = true;
      continue;
    }
    if (separator) { blocks.push(current.join('\n')); current = []; separator = false; }
    current.push(line);
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks.filter(Boolean);
}

/** Read only through the selected host's SDK. Never join across message IDs or tool calls. */
export async function readWholeAnswer(timeline: Timeline, messageId: string, signal: AbortSignal): Promise<WholeAnswer | null> {
  if (signal.aborted) return null;
  let page = await timeline.refetch({ projection: 'projected', direction: 'tail', limit: 200 });
  for (let pages = 1; ; pages++) {
    if (signal.aborted || page.error || page.agent?.status !== 'idle' || page.agent.archivedAt) return null;
    const matches = page.entries.filter(({ item }) => item.type === 'assistant_message' && item.messageId === messageId);
    if (matches.length > 1) return null;
    const item = matches[0]?.item;
    if (item?.type === 'assistant_message') {
      if (!item.text.trim() || item.text.length > 32000) return null;
      const blocks = splitAnswerBlocks(item.text);
      const tail = blocks.at(-1);
      return { original: item.text, blocks, uniqueTail: !!tail && blocks.filter((block) => block === tail).length === 1 };
    }
    if (pages >= 5 || !page.hasOlder || !page.startCursor) return null;
    page = await timeline.refetch({ projection: 'projected', direction: 'before', cursor: page.startCursor, limit: 200 });
  }
}

export function placeAnswerBlock(fragment: string, whole: WholeAnswer | null | undefined): 'whole' | 'hidden' | 'original' {
  if (!whole) return 'original';
  // Restored history can arrive as one unsplit item, including repeated paragraphs.
  if (fragment === whole.original) return 'whole';
  // The beta API omits block indexes. Identical tail blocks cannot be distinguished:
  // keep ALL their original blocks instead of hiding content or duplicating controls.
  if (!whole.uniqueTail) return 'original';
  const block = fragment.replace(/\n+$/, '');
  if (!whole.blocks.includes(block)) return 'original';
  return block === whole.blocks.at(-1) ? 'whole' : 'hidden';
}
