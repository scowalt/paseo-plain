import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { configSchema, configurationResultSchema, requestSchema, type Configuration, type RewriteRequest, type RewriteResult } from '../shared/contracts';
import { completeWithPi, PROMPT_VERSION, type Complete } from './pi-worker';
import { rewriteText } from './rewriter';

const MAX_ENTRIES = 200, MAX_BYTES = 4_000_000, TTL = 24 * 60 * 60 * 1000;
const persistedSchema = z.array(z.object({ key: z.string(), agentId: z.string(), at: z.number(), text: z.string().max(64000) })).max(MAX_ENTRIES);
type Entry = { agentId: string; at: number; result: RewriteResult; controller?: AbortController };

export function createRewriteService({ directory, complete = completeWithPi }: { directory: string; complete?: Complete }) {
  let values = configSchema.parse({}), revision = 0, error: string | null = null, stopped = false;
  let active = 0;
  const cache = new Map<string, Entry>();
  const queue: Array<() => Promise<void>> = [];
  const jobs = new Set<Promise<void>>();
  let writes = Promise.resolve();
  const atomic = async (file: string, data: unknown) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, file), temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
  };
  const trim = () => {
    let bytes = 0;
    for (const [key, entry] of [...cache].reverse()) {
      bytes += Buffer.byteLength(entry.result.text ?? '');
      if (!entry.controller && (Date.now() - entry.at > TTL || bytes > MAX_BYTES)) cache.delete(key);
    }
    while (cache.size > MAX_ENTRIES) {
      const oldest = [...cache].find(([, entry]) => !entry.controller);
      if (!oldest) break;
      cache.delete(oldest[0]);
    }
  };
  const persist = () => {
    writes = writes.catch(() => {}).then(async () => {
      trim();
      const records = [...cache].flatMap(([key, entry]) => entry.result.status === 'ready'
        ? [{ key, agentId: entry.agentId, at: entry.at, text: entry.result.text! }] : []);
      await atomic('cache.json', records);
    }).catch(() => { error = 'Cache could not be saved. Originals remain available.'; });
    return writes;
  };
  const ready = (async () => {
    try {
      const saved = configurationResultSchema.parse(JSON.parse(await readFile(join(directory, 'configuration.json'), 'utf8')));
      values = saved.values; revision = saved.revision;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') error = 'Settings could not be read. Rewriting is off until you save valid settings.';
    }
    try {
      const raw = await readFile(join(directory, 'cache.json'), 'utf8');
      if (raw.length > MAX_BYTES * 2) throw new Error('oversize');
      for (const entry of persistedSchema.parse(JSON.parse(raw))) cache.set(entry.key, { ...entry, result: { status: 'ready', text: entry.text } });
      trim();
    } catch { /* Cache is optional; never block original messages on damaged cache. */ }
  })();
  const keyFor = (request: RewriteRequest) => createHash('sha256').update(JSON.stringify([
    PROMPT_VERSION, request.agentId, request.original, values.model, values.style,
  ])).digest('hex');
  const cancel = (agentId?: string) => {
    for (const entry of cache.values()) if (entry.controller && (!agentId || entry.agentId === agentId)) {
      entry.controller.abort();
      entry.result = { status: 'failed', reason: 'Canceled. Showing the original.' };
    }
  };
  const pump = () => {
    while (!stopped && active < 2 && queue.length) {
      active++;
      const job = queue.shift()!().finally(() => { active--; jobs.delete(job); pump(); });
      jobs.add(job);
    }
  };
  const enqueue = async (raw: RewriteRequest): Promise<RewriteResult> => {
    await ready;
    const request = requestSchema.parse(raw);
    if (!values.enabled || stopped) return { status: 'disabled' };
    trim();
    const key = keyFor(request), existing = cache.get(key);
    if (existing && (existing.result.status === 'pending' || existing.result.status === 'ready')) return existing.result;
    if (queue.length >= 20) return { status: 'failed', reason: 'Rewrite queue is full. Showing the original.' };
    const controller = new AbortController();
    const entry: Entry = { agentId: request.agentId, at: Date.now(), result: { status: 'pending' }, controller };
    const snapshot: Configuration = { ...values };
    cache.set(key, entry);
    queue.push(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (controller.signal.aborted) return;
        // The worker also enforces this timeout at its process boundary.
        const canceled = new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true });
          timer = setTimeout(() => controller.abort(), snapshot.timeoutSeconds * 1000);
        });
        const text = await Promise.race([
          rewriteText(request.original, (masked) => complete(masked, snapshot, controller.signal)), canceled,
        ]);
        if (!controller.signal.aborted && cache.get(key) === entry && !stopped) entry.result = { status: 'ready', text };
      } catch {
        entry.result = { status: 'failed', reason: 'Rewrite unavailable or failed validation. Showing the original.' };
      } finally {
        if (timer) clearTimeout(timer);
        delete entry.controller;
        await persist();
      }
    });
    pump();
    return entry.result;
  };
  // Serialize settings changes so two clients cannot overwrite each other's revision.
  let configuring = Promise.resolve();
  const configuration = async () => { await ready; return { values: { ...values }, revision, error }; };
  return {
    configuration,
    configure(input: { values: Configuration; revision: number }) {
      const operation = configuring.then(async () => {
        await ready;
        if (input.revision !== revision) return { ...await configuration(), error: 'Settings changed on another client. Reload before saving.' };
        const next = configSchema.parse(input.values);
        await atomic('configuration.json', { values: next, revision: revision + 1, error: null });
        if (!next.enabled || next.model !== values.model || next.style !== values.style) cancel();
        values = next; revision++; error = null;
        return await configuration();
      });
      configuring = operation.then(() => {}, () => {});
      return operation;
    },
    async lookup(raw: RewriteRequest): Promise<RewriteResult> {
      await ready;
      const request = requestSchema.parse(raw);
      if (!values.enabled || stopped) return { status: 'disabled' };
      trim();
      return cache.get(keyFor(request))?.result ?? { status: 'uncached' };
    },
    enqueue,
    async cancelAgent(agentId: string) { await ready; cancel(agentId); },
    async clear() { await ready; cancel(); cache.clear(); await persist(); return { cleared: true }; },
    async settled() { while (jobs.size) await Promise.all([...jobs]); await writes; },
    async dispose() { stopped = true; await ready; cancel(); queue.length = 0; await Promise.all([...jobs]); await writes; },
  };
}
