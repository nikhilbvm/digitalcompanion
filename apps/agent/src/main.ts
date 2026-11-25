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
import { createDbPool, mapPerson, type PersonRow } from '@companion/core';
import { assertAgentConfig, config } from './config.js';
import { CompanionAgent } from './companion-agent.js';
import { CompanionAnthropicLLM } from './llm/anthropic.js';
import { CompanionOpenRouterLLM } from './llm/openrouter.js';
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

    const db = createDbPool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl,
      sslCaPath: config.databaseSslCa || undefined,
    });

    let person: ReturnType<typeof mapPerson>;
    try {
      const { rows } = await db.query<PersonRow>('select * from people where id = $1', [
        metadata.personId,
      ]);
      const row = rows[0];
      if (!row) throw new Error('person not found');
      person = mapPerson(row);
    } catch (error) {
      console.error(
        '[agent] could not load person:',
        error instanceof Error ? error.message : error,
      );
      await db.end();
      ctx.shutdown('person not found');
      return;
    }

    const recorder = new Recorder(db, metadata.conversationId);

    const llm =
      config.llmProvider === 'openrouter'
        ? new CompanionOpenRouterLLM({
            apiKey: config.openrouterApiKey,
            model: config.openrouterModel,
            baseUrl: config.openrouterBaseUrl,
            effort: config.llmEffort,
            maxTokens: config.voiceMaxTokens,
            provider: config.openrouterProvider,
            allowFallbacks: config.openrouterAllowFallbacks,
            dataCollection: config.openrouterDataCollection,
          })
        : new CompanionAnthropicLLM({
            apiKey: config.anthropicApiKey,
            model: config.anthropicModel,
            effort: config.llmEffort,
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
      await db.end();
    }
  },
});

try {
  assertAgentConfig();
} catch (error) {
  console.error(`[agent] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: config.agentName,
  }),
);
