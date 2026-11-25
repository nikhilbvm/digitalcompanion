import type { Response } from 'express';

export type SseEvent =
  | 'meta'
  | 'delta'
  | 'flag'
  | 'done'
  | 'error';

/**
 * Minimal SSE writer. Event data is JSON on a single line, so a multi-line
 * string can never break the frame.
 */
export class SseWriter {
  private closed = false;

  constructor(private readonly res: Response) {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    this.res.flushHeaders?.();
  }

  event(name: SseEvent, data: unknown): void {
    if (this.closed || this.res.writableEnded) return;
    this.res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.res.writableEnded) this.res.end();
  }

  get isClosed(): boolean {
    return this.closed || this.res.writableEnded;
  }
}
