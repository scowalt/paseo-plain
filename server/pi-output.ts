// Pi's documented JSON event stream, not prose heuristics, tells us whether
// generation finished. Claudish's providers.sh inspired rejecting output-cap
// completions; Pi normalizes those provider reasons to stopReason: "length".
const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 128000;

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('pi-invalid-output');
  return value as RecordValue;
}

function completedText(value: unknown): string {
  const message = record(value);
  const rawStopReason = message.rawStopReason;
  if (rawStopReason !== undefined && typeof rawStopReason !== 'string') throw new Error('pi-invalid-output');
  if (message.role !== 'assistant' || message.stopReason !== 'stop' || message.errorMessage ||
      (rawStopReason && ['length', 'max_tokens', 'max_output_tokens'].includes(rawStopReason))) throw new Error('pi-incomplete');
  if (!Array.isArray(message.content)) throw new Error('pi-invalid-output');
  let text = '';
  for (const value of message.content) {
    const block = record(value);
    if (block.type === 'thinking') continue;
    if (block.type !== 'text' || typeof block.text !== 'string') throw new Error('pi-incomplete');
    text += block.text;
    if (Buffer.byteLength(text) > MAX_TEXT_BYTES) throw new Error('output-limit');
  }
  if (!text.trim()) throw new Error('empty');
  return text;
}

/** Bounded streaming reader. No delta text or reasoning is returned or logged. */
export class PiCompletionReader {
  private buffer = '';
  private bytes = 0;
  private text: string | undefined;
  private ended = false;

  push(chunk: string): void {
    this.bytes += Buffer.byteLength(chunk);
    if (this.bytes > MAX_STREAM_BYTES) throw new Error('output-limit');
    this.buffer += chunk;
    let end: number;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      this.readLine(line);
    }
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) throw new Error('output-limit');
  }

  private readLine(line: string): void {
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error('output-limit');
    if (!line.trim()) return;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new Error('pi-invalid-output'); }
    const event = record(parsed);
    if (typeof event.type !== 'string') throw new Error('pi-invalid-output');
    if (event.type === 'error' || event.type.startsWith('tool_execution_') ||
        event.type.startsWith('auto_retry_') || event.type.startsWith('auto_compaction_')) throw new Error('pi-incomplete');
    if (event.type === 'message_start' || event.type === 'message_update') {
      if (this.text !== undefined || this.ended) throw new Error('pi-incomplete');
      if (event.type === 'message_update') {
        const update = record(event.assistantMessageEvent);
        if (typeof update.type !== 'string') throw new Error('pi-invalid-output');
        if (update.type === 'error' || update.type.startsWith('toolcall_') ||
            (update.type === 'done' && update.reason !== 'stop')) throw new Error('pi-incomplete');
      }
    } else if (event.type === 'message_end') {
      const message = record(event.message);
      if (message.role === 'user' && this.text === undefined && !this.ended) return;
      if (this.text !== undefined || this.ended) throw new Error('pi-incomplete');
      this.text = completedText(message);
    } else if (event.type === 'turn_end') {
      if (this.ended || this.text === undefined || completedText(event.message) !== this.text ||
          !Array.isArray(event.toolResults) || event.toolResults.length) throw new Error('pi-incomplete');
    } else if (event.type === 'agent_end') {
      if (this.ended || this.text === undefined || !Array.isArray(event.messages)) throw new Error('pi-incomplete');
      const messages = event.messages.map(record);
      if (messages.some((message) => message.role !== 'user' && message.role !== 'assistant')) throw new Error('pi-incomplete');
      const assistants = messages.filter((message) => message.role === 'assistant');
      if (assistants.length !== 1 || completedText(assistants[0]) !== this.text) throw new Error('pi-incomplete');
      this.ended = true;
    } else if ((event.type === 'agent_start' || event.type === 'turn_start') && this.text !== undefined) {
      throw new Error('pi-incomplete');
    }
  }

  finish(): string {
    if (this.buffer) { this.readLine(this.buffer); this.buffer = ''; }
    if (!this.ended || this.text === undefined) throw new Error('pi-incomplete');
    return this.text.trim();
  }
}
