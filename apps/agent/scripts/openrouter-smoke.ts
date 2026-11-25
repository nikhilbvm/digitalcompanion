import dotenv from 'dotenv';
import { ChatContext, initializeLogger } from '@livekit/agents';
import { CompanionOpenRouterLLM } from '../src/llm/openrouter.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
initializeLogger({ pretty: false, level: 'error' });

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

const chatCtx = new ChatContext();
chatCtx.addMessage({
  role: 'system',
  content: 'You are a concise test assistant. Follow the user instruction exactly.',
});
chatCtx.addMessage({ role: 'user', content: 'Reply with exactly: VOICE OK' });

const llm = new CompanionOpenRouterLLM({
  apiKey,
  model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-5.5',
  maxTokens: 32,
  effort: 'low',
  provider: 'anthropic',
  allowFallbacks: false,
  dataCollection: 'deny',
});

const result = await llm.chat({ chatCtx }).collect();
console.log(JSON.stringify({ text: result.text, usage: result.usage }));
