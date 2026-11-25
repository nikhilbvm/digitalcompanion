import { Router } from 'express';
import { chatRequestSchema } from '@companion/core';
import { config } from '../config.js';
import { SseWriter } from '../sse.js';
import { runChatTurn } from '../services/chat-turn.js';
import { getStore } from '../services/store.js';

export const chatRouter = Router();

chatRouter.post('/chat', async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues });
    return;
  }

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    res.status(503).json({ error: 'not_configured', message: 'Supabase is not configured' });
    return;
  }
  if (!config.anthropicApiKey) {
    res.status(503).json({ error: 'not_configured', message: 'ANTHROPIC_API_KEY is not set' });
    return;
  }

  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const writer = new SseWriter(res);
  try {
    await runChatTurn({
      store: getStore(),
      writer,
      request: parsed.data,
      signal: controller.signal,
    });
  } catch (error) {
    console.error('[chat] route error:', error instanceof Error ? error.message : error);
    if (!writer.isClosed) {
      writer.event('error', { message: 'The companion had trouble replying. Please try again.' });
      writer.close();
    }
  }
});
