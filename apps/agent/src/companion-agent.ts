import {
  Agent,
  type ChatChunk,
  type ChatContext,
  type ChatMessage,
  type FlushSentinel,
  type ModelSettings,
  type ToolContext,
} from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { buildSystemText, runInputGuardrail, type Person } from '@companion/core';
import { filterLlmStream, filterTextForTts, tapFirstAudio } from './guardrail-nodes.js';
import type { CompanionLLM } from './llm/types.js';
import type { Recorder } from './recorder.js';

export interface CompanionAgentOptions {
  person: Person;
  recorder: Recorder;
  llm: CompanionLLM;
}

export class CompanionAgent extends Agent {
  private readonly recorder: Recorder;
  private readonly companionLLM: CompanionLLM;
  private turnSpeechEndedAt: number | null = null;
  private lastGuardrailMs = 0;

  constructor({ person, recorder, llm }: CompanionAgentOptions) {
    super({
      instructions: buildSystemText(person),
      llm,
    });
    this.recorder = recorder;
    this.companionLLM = llm;
  }

  /**
   * Runs after the final transcript, before the LLM. Awaiting the classifier
   * costs a little latency but guarantees the 911/988 instruction is in the
   * prompt for this turn.
   */
  override async onUserTurnCompleted(
    _chatCtx: ChatContext,
    newMessage: ChatMessage,
  ): Promise<void> {
    const text = newMessage.rawTextContent ?? '';
    if (!text.trim()) {
      this.companionLLM.setTurnInstruction(null);
      return;
    }

    this.turnSpeechEndedAt = newMessage.createdAt;
    const startedAt = Date.now();
    const result = await runInputGuardrail(text);
    this.lastGuardrailMs = Date.now() - startedAt;

    // Keep identifiers out of the model context so it cannot repeat them.
    if (result.maskedText !== text) {
      newMessage.content = [result.maskedText];
    }

    await this.recorder.recordUser(text, result.hits);
    this.companionLLM.setTurnInstruction(result.safetyInstruction);
  }

  /**
   * Filter the LLM stream before LiveKit builds the assistant message, so the
   * chat context, live transcript and TTS all receive safe text. Persistence
   * happens here, once per reply.
   */
  override async llmNode(
    chatCtx: ChatContext,
    toolCtx: ToolContext,
    modelSettings: ModelSettings,
  ): Promise<ReadableStream<ChatChunk | string | FlushSentinel> | null> {
    const source = await Agent.default.llmNode(this, chatCtx, toolCtx, modelSettings);
    if (!source) return null;

    return filterLlmStream(source, async (safeText, flags) => {
      await this.recorder.recordAssistant(safeText, flags);
    }) as ReadableStream<ChatChunk | string | FlushSentinel>;
  }

  /**
   * Second safety layer around TTS (covers any text that did not come through
   * llmNode, e.g. a future `session.say`). The LLM path is already filtered.
   */
  override async ttsNode(
    text: ReadableStream<string> | AsyncIterable<string>,
    modelSettings: ModelSettings,
  ): Promise<ReadableStream<AudioFrame> | null> {
    const speechEndedAt = this.turnSpeechEndedAt;
    const guardrailMs = this.lastGuardrailMs;
    this.turnSpeechEndedAt = null;
    this.lastGuardrailMs = 0;

    const filtered = filterTextForTts(text, async (safeText, flags) => {
      // Normal replies are already safe and persisted by llmNode. Only persist
      // here if this second layer actually caught something.
      if (flags.length > 0) {
        await this.recorder.recordAssistant(safeText, flags);
      }
    });

    const audio = await Agent.default.ttsNode(this, filtered, modelSettings);

    return tapFirstAudio(audio, () => {
      const now = Date.now();
      console.log(
        JSON.stringify({
          event: 'voice_turn',
          conversationId: this.recorder.conversationId,
          speechToFirstAudioMs: speechEndedAt ? now - speechEndedAt : null,
          guardrailMs,
        }),
      );
    });
  }
}
