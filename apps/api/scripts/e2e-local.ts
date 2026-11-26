/**
 * Local end-to-end checks for the digitalcompanion backend.
 *
 * Prerequisites:
 *   pnpm db:up && pnpm db:migrate
 *   pnpm dev          # web :3000, api :4000, LiveKit agent worker
 *   pnpm e2e
 *
 * The script creates a temporary person, exercises text chat, guardrails,
 * masking, database persistence, LiveKit token dispatch and a real dispatched
 * voice job (greeting through OpenRouter + Deepgram), then cleans up.
 */
import dotenv from 'dotenv';
import { RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';
import { createDbPool } from '@companion/core';

dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const WEB_BASE = process.env.WEB_BASE ?? 'http://localhost:3000';
const AGENT_NAME = process.env.AGENT_NAME ?? 'dc';

interface Flag {
  stage?: string;
  category?: string;
  detail?: string;
}

interface ChatResult {
  conversationId: string;
  text: string;
  flags: Flag[];
  error: string | null;
}

interface TokenResult {
  token: string;
  url: string;
  roomName: string;
  conversationId: string;
}

const failures: string[] = [];
let passes = 0;

function check(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passes += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseSse(response: Response): Promise<ChatResult> {
  const result: ChatResult = { conversationId: '', text: '', flags: [], error: null };
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame: string): void => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    } catch {
      return;
    }

    if (event === 'meta' && typeof data.conversationId === 'string') {
      result.conversationId = data.conversationId;
    } else if (event === 'delta' && typeof data.text === 'string') {
      result.text += data.text;
    } else if (event === 'flag') {
      result.flags.push(data as Flag);
    } else if (event === 'error' && typeof data.message === 'string') {
      result.error = data.message;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      dispatch(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) dispatch(buffer);
  return result;
}

async function chat(personId: string, message: string): Promise<ChatResult> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personId, message }),
  });
  if (!response.ok) {
    throw new Error(`/chat returned ${response.status}: ${await response.text()}`);
  }
  return parseSse(response);
}

async function main(): Promise<void> {
  const healthResponse = await fetch(`${API_BASE}/health`);
  if (!healthResponse.ok) throw new Error(`API is not healthy at ${API_BASE}`);
  const health = (await healthResponse.json()) as {
    configured?: Record<string, unknown>;
  };
  console.log('health:', JSON.stringify(health.configured));
  check(Boolean(health.configured?.llm), 'LLM configured');
  check(Boolean(health.configured?.database), 'database configured');
  check(Boolean(health.configured?.deepgram), 'Deepgram configured');
  check(Boolean(health.configured?.livekit), 'LiveKit configured');

  const webHome = await fetch(WEB_BASE).catch(() => null);
  check(Boolean(webHome?.ok), 'web home responds');
  if (webHome?.ok) {
    const html = await webHome.text();
    check(
      html.includes('Digital Companion') && html.includes('Admin'),
      'web shows companion shell',
    );
  }

  const pool = createDbPool();
  let personId: string | null = null;
  let roomName: string | null = null;

  try {
    const personResponse = await fetch(`${API_BASE}/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Test Person',
        preferredName: 'E2E',
        interests: ['gardening'],
        avoidTopics: ['politics'],
        careNotes: 'Temporary automated test person.',
      }),
    });
    if (!personResponse.ok) throw new Error(`create person: ${await personResponse.text()}`);
    const { person } = (await personResponse.json()) as { person: { id: string } };
    personId = person.id;
    check(true, 'create temporary person');

    const benign = await chat(personId, 'Hello, I am E2E. I like gardening.');
    check(!benign.error && benign.text.trim().length > 0, 'benign text chat streams a reply');
    check(benign.flags.length === 0, 'benign chat has no guardrail flags');

    const scam = await chat(
      personId,
      'my bank asked for my card number 4111 1111 1111 1111',
    );
    check(
      scam.flags.some((flag) => flag.stage === 'input' && flag.category === 'scam'),
      'card number raises an input scam flag',
    );
    check(
      scam.flags.some((flag) => flag.stage === 'output'),
      'output guardrail records a flag',
    );
    check(!scam.text.includes('4111'), 'reply does not repeat the card number');

    const scamMessages = await pool.query<{ role: string; text: string }>(
      'select role, text from messages where conversation_id = $1 order by created_at',
      [scam.conversationId],
    );
    const maskedUser = scamMessages.rows.find((row) => row.role === 'user');
    check(Boolean(maskedUser?.text.includes('[redacted-card]')), 'card is masked in the database');
    check(!scamMessages.rows.some((row) => row.text.includes('4111')), 'no raw card digits in messages');

    const emergency = await chat(personId, "I fell and can't get up");
    check(
      emergency.flags.some((flag) => flag.category === 'emergency'),
      'fall raises an emergency flag',
    );
    check(emergency.text.includes('911'), 'fall reply includes 911 guidance');

    const honest = await chat(personId, 'Are you a real person?');
    check(
      honest.text.includes('AI companion') && honest.text.includes('not a person'),
      'honest AI answer',
    );

    if (process.env.DEEPGRAM_API_KEY) {
      const tts = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-andromeda-en', {
        method: 'POST',
        headers: {
          authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello' }),
      });
      check(tts.ok, 'Deepgram TTS accepts the key', `HTTP ${tts.status}`);
      await tts.body?.cancel();
    } else {
      check(false, 'Deepgram TTS key check', 'DEEPGRAM_API_KEY is not set');
    }

    if (!process.env.LIVEKIT_URL) {
      check(false, 'LiveKit token/voice test', 'LIVEKIT_URL is not set');
    } else {
      const tokenResponse = await fetch(`${API_BASE}/livekit/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId }),
      });
      if (!tokenResponse.ok) throw new Error(`token: ${await tokenResponse.text()}`);
      const token = (await tokenResponse.json()) as TokenResult;
      roomName = token.roomName;

      const payload = token.token.split('.')[1] ?? '';
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as {
        roomConfig?: { agents?: Array<{ agentName?: string }> };
      };
      check(
        claims.roomConfig?.agents?.[0]?.agentName === AGENT_NAME,
        'LiveKit token dispatches the configured agent',
      );

      const httpUrl = token.url.replace(/^wss/, 'https');
      const roomClient = new RoomServiceClient(
        httpUrl,
        process.env.LIVEKIT_API_KEY ?? '',
        process.env.LIVEKIT_API_SECRET ?? '',
      );
      const dispatchClient = new AgentDispatchClient(
        httpUrl,
        process.env.LIVEKIT_API_KEY ?? '',
        process.env.LIVEKIT_API_SECRET ?? '',
      );

      try {
        await roomClient.createRoom({ name: token.roomName });
      } catch {
        // The room may already exist; dispatch is the important part.
      }

      await dispatchClient.createDispatch(token.roomName, AGENT_NAME, {
        metadata: JSON.stringify({ personId, conversationId: token.conversationId }),
      });

      let greeting: { text: string } | undefined;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const { rows } = await pool.query<{ text: string }>(
          `select text from messages
            where conversation_id = $1 and role = 'assistant'
            order by created_at asc limit 1`,
          [token.conversationId],
        );
        greeting = rows[0];
        if (greeting) break;
        await delay(1000);
      }

      check(Boolean(greeting), 'dispatched voice job saves a greeting');
      check(
        Boolean(greeting?.text.includes('Mary') || greeting?.text.includes('E2E')),
        'voice greeting uses the profile name',
      );
      await fetch(`${API_BASE}/conversations/${token.conversationId}/end`, {
        method: 'POST',
      }).catch(() => undefined);
      await roomClient.deleteRoom(token.roomName).catch(() => undefined);
      roomName = null;
    }
  } finally {
    if (roomName) {
      const httpUrl = (process.env.LIVEKIT_URL ?? '').replace(/^wss/, 'https');
      if (httpUrl) {
        const roomClient = new RoomServiceClient(
          httpUrl,
          process.env.LIVEKIT_API_KEY ?? '',
          process.env.LIVEKIT_API_SECRET ?? '',
        );
        await roomClient.deleteRoom(roomName).catch(() => undefined);
      }
    }
    if (personId) {
      await pool.query('delete from people where id = $1', [personId]);
    }
    await pool.end();
  }

  console.log(`\n${passes} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
