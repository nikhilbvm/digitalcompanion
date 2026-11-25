import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

// Root .env first, then an app-local apps/api/.env (which wins if present).
dotenv.config({ path: path.resolve(here, '../../../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../.env'), override: true, quiet: true });

const effort = (process.env.LLM_EFFORT ?? process.env.ANTHROPIC_EFFORT ?? 'low') as
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

const rawProvider = process.env.LLM_PROVIDER;
const llmProvider =
  rawProvider === 'anthropic' || rawProvider === 'openrouter'
    ? rawProvider
    : process.env.OPENROUTER_API_KEY
      ? 'openrouter'
      : 'anthropic';

export const config = {
  // API_PORT is the local/monorepo name; PORT is what most cloud runtimes set.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  llmProvider,
  llmEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'low',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-5.5',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  openrouterProvider: process.env.OPENROUTER_PROVIDER ?? 'anthropic',
  openrouterAllowFallbacks: process.env.OPENROUTER_ALLOW_FALLBACKS === 'true',
  openrouterDataCollection:
    process.env.OPENROUTER_DATA_COLLECTION === 'allow' ? ('allow' as const) : ('deny' as const),
  chatHistoryLimit: Number(process.env.CHAT_HISTORY_LIMIT ?? 20),
  maxReplyTokens: Number(process.env.MAX_REPLY_TOKENS ?? 500),
  agentName: process.env.AGENT_NAME ?? 'dc',
  livekitUrl: process.env.LIVEKIT_URL ?? '',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  databaseSslCa: process.env.DATABASE_SSL_CA ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
} as const;

export const llmConfigured =
  config.llmProvider === 'openrouter'
    ? Boolean(config.openrouterApiKey)
    : Boolean(config.anthropicApiKey);

export function configuredServices(): Record<string, string | boolean> {
  return {
    llm: llmConfigured,
    llmProvider: config.llmProvider,
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    livekit: Boolean(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret),
    database: Boolean(config.databaseUrl),
  };
}
