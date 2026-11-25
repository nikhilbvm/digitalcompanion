import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

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
  agentName: process.env.AGENT_NAME ?? 'companion',
  llmProvider,
  llmEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'low',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-5.5',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  openrouterProvider: process.env.OPENROUTER_PROVIDER ?? 'anthropic',
  openrouterAllowFallbacks: process.env.OPENROUTER_ALLOW_FALLBACKS === 'true',
  openrouterDataCollection:
    process.env.OPENROUTER_DATA_COLLECTION === 'allow' ? ('allow' as const) : ('deny' as const),
  voiceMaxTokens: Number(process.env.VOICE_MAX_TOKENS ?? 300),
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? '',
  sttModel: process.env.VOICE_STT_MODEL ?? 'nova-3',
  ttsModel: process.env.VOICE_TTS_MODEL ?? 'aura-2-andromeda-en',
  livekitUrl: process.env.LIVEKIT_URL ?? '',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  databaseSslCa: process.env.DATABASE_SSL_CA ?? '',
} as const;

export const llmConfigured =
  config.llmProvider === 'openrouter'
    ? Boolean(config.openrouterApiKey)
    : Boolean(config.anthropicApiKey);

export function assertAgentConfig(): void {
  const missing = [
    [config.llmProvider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY', llmConfigured],
    ['DEEPGRAM_API_KEY', config.deepgramApiKey],
    ['LIVEKIT_URL', config.livekitUrl],
    ['LIVEKIT_API_KEY', config.livekitApiKey],
    ['LIVEKIT_API_SECRET', config.livekitApiSecret],
    ['DATABASE_URL', config.databaseUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Voice agent is missing environment variables: ${missing.join(', ')}`);
  }
}
