import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

// Root .env first, then an app-local apps/api/.env (which wins if present).
dotenv.config({ path: path.resolve(here, '../../../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../.env'), override: true, quiet: true });

const effort = (process.env.ANTHROPIC_EFFORT ?? 'low') as
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export const config = {
  // API_PORT is the local/monorepo name; PORT is what most cloud runtimes set.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  anthropicEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'low',
  chatHistoryLimit: Number(process.env.CHAT_HISTORY_LIMIT ?? 20),
  maxReplyTokens: Number(process.env.MAX_REPLY_TOKENS ?? 500),
  agentName: process.env.AGENT_NAME ?? 'companion',
  livekitUrl: process.env.LIVEKIT_URL ?? '',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  databaseSslCa: process.env.DATABASE_SSL_CA ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
} as const;

export function configuredServices(): Record<string, boolean> {
  return {
    anthropic: Boolean(config.anthropicApiKey),
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    livekit: Boolean(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret),
    database: Boolean(config.databaseUrl),
  };
}
