import { fileURLToPath } from 'node:url';
import {
  AgentSession,
  AgentSessionEventTypes,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  type JobContext,
} from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as silero from '@livekit/agents-plugin-silero';
import {
  createSupabaseClient,
  mapPerson,
  type PersonRow,
} from '@companion/core';
import { assertAgentConfig, config } from './config.js';
import { CompanionAgent } from './companion-agent.js';
import { CompanionAnthropicLLM } from './llm/anthropic.js';
import { Recorder } from './recorder.js';

interface DispatchMetadata {
  personId: string;
  conversationId: string;
}

function parseMetadata(raw: string | undefined): DispatchMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? '{}');
  } catch {
    throw new Error('job metadata is not valid JSON');
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.personId !== 'string' || typeof record.conversationId !== 'string') {
    throw new Error('job metadata must contain personId and conversationId');
  }
  return { personId: record.personId, conversationId: record.conversationId };
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    let metadata: DispatchMetadata;
    try {
      metadata = parseMetadata(ctx.job.metadata);
    } catch (error) {
      console.error('[agent] invalid dispatch metadata:', error instanceof Error ? error.message : error);
      ctx.shutdown('invalid dispatch metadata');
      return;
    }

    const supabase = createSupabaseClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    });

    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('id', metadata.personId)
      .maybeSingle();

    if (error || !data) {
      console.error(
        '[agent] could not load person:',
        error?.message ?? 'person not found',
      );
      ctx.shutdown('person not found');
      return;
    }

    const person = mapPerson(data as PersonRow);
    const recorder = new Recorder(supabase, metadata.conversationId);

    const llm = new CompanionAnthropicLLM({
      apiKey: config.anthropicApiKey,
      model: config.anthropicModel,
      effort: config.anthropicEffort,
      maxTokens: config.voiceMaxTokens,
    });

    const agent = new CompanionAgent({ person, recorder, llm });
    const vad = await silero.VAD.load();

    const session = new AgentSession({
      stt: new deepgram.STT({
        apiKey: config.deepgramApiKey,
        model: config.sttModel,
        language: 'en-US',
      }),
      llm,
      tts: new deepgram.TTS({
        apiKey: config.deepgramApiKey,
        model: config.ttsModel,
        sampleRate: 24000,
      }),
      vad,
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        interruption: {
          mode: 'adaptive',
          resumeFalseInterruption: true,
          falseInterruptionTimeout: 1000,
        },
      },
    });

    const closed = new Promise<void>((resolve) => {
      session.once(AgentSessionEventTypes.Close, () => resolve());
    });

    session.on(AgentSessionEventTypes.Error, (event) => {
      console.error('[agent] session error:', event.error);
    });

    try {
      await session.start({ agent, room: ctx.room });

      session.generateReply({
        instructions: `Greet ${person.preferredName} warmly by name and ask how they are doing today. Keep it to one or two short sentences.`,
      });

      await closed;
    } finally {
      await recorder.endConversation();
    }
  },
});

assertAgentConfig();

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: config.agentName,
  }),
);
