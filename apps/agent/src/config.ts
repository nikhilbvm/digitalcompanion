import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config({ path: path.resolve(here, '../.env'), override: true });

const effort = (process.env.ANTHROPIC_EFFORT ?? 'low') as
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export const config = {
  agentName: process.env.AGENT_NAME ?? 'companion',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  anthropicEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'low',
  voiceMaxTokens: Number(process.env.VOICE_MAX_TOKENS ?? 300),
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? '',
  sttModel: process.env.VOICE_STT_MODEL ?? 'nova-3',
  ttsModel: process.env.VOICE_TTS_MODEL ?? 'aura-2-andromeda-en',
  livekitUrl: process.env.LIVEKIT_URL ?? '',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
} as const;

export function assertAgentConfig(): void {
  const missing = [
    ['ANTHROPIC_API_KEY', config.anthropicApiKey],
    ['DEEPGRAM_API_KEY', config.deepgramApiKey],
    ['LIVEKIT_URL', config.livekitUrl],
    ['LIVEKIT_API_KEY', config.livekitApiKey],
    ['LIVEKIT_API_SECRET', config.livekitApiSecret],
    ['SUPABASE_URL', config.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabaseServiceRoleKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Voice agent is missing environment variables: ${missing.join(', ')}`);
  }
}
