import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const configSchema = z.object({
  enabled: z.boolean().default(false),
  model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/).max(160).default('gpt-6-astra'),
  display: z.enum(['rewrite', 'original', 'compare']).default('rewrite'),
  timeoutSeconds: z.number().int().min(5).max(120).default(45),
  style: z.string().max(4000).default('Talk like a helpful coworker. Use everyday words and natural contractions. Keep enough detail to explain the answer. Do not force brevity, add fake enthusiasm, or talk down to the reader.'),
}).strict();
export type Configuration = z.infer<typeof configSchema>;
export const requestSchema = z.object({
  agentId: z.string().min(1).max(200),
  original: z.string().min(1).max(32000),
}).strict();
export type RewriteRequest = z.infer<typeof requestSchema>;
export const answerSchema = z.object({ original: z.string(), messageId: z.string().nullable() });
export const resultSchema = z.object({
  status: z.enum(['uncached', 'pending', 'ready', 'failed', 'disabled']),
  text: z.string().optional(),
  reason: z.string().optional(),
});
export type RewriteResult = z.infer<typeof resultSchema>;
export const configurationResultSchema = z.object({ values: configSchema, revision: z.number().int(), error: z.string().nullable() });
export const readConfiguration = defineRpc({ name: 'plain.configuration', input: z.object({}), output: configurationResultSchema });
export const saveConfiguration = defineRpc({ name: 'plain.configure', input: z.object({ values: configSchema, revision: z.number().int() }), output: configurationResultSchema });
export const lookupRewrite = defineRpc({ name: 'plain.lookup', input: requestSchema, output: resultSchema });
export const requestRewrite = defineRpc({ name: 'plain.rewrite', input: requestSchema, output: resultSchema });
export const clearCache = defineRpc({ name: 'plain.clear', input: z.object({}), output: z.object({ cleared: z.boolean() }) });
export const previewRewrite = defineRpc({ name: 'plain.preview', input: z.object({ original: z.string().min(1).max(8000) }), output: resultSchema });
