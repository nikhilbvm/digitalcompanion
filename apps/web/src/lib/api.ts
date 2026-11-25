import type {
  Conversation,
  GuardrailFlag,
  Message,
  NewPerson,
  Person,
} from '@companion/core/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function getPeople(): Promise<Person[]> {
  const { people } = await request<{ people: Person[] }>('/people');
  return people;
}

export async function createPerson(input: NewPerson): Promise<Person> {
  const { person } = await request<{ person: Person }>('/people', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return person;
}

export async function getConversations(personId?: string): Promise<Conversation[]> {
  const query = personId ? `?personId=${encodeURIComponent(personId)}` : '';
  const { conversations } = await request<{ conversations: Conversation[] }>(
    `/conversations${query}`,
  );
  return conversations;
}

export interface ConversationDetail {
  conversation: Conversation;
  person: Person;
  messages: Message[];
  flags: GuardrailFlag[];
}

export function getConversationDetail(id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`);
}

export async function endConversation(id: string): Promise<void> {
  await request(`/conversations/${id}/end`, { method: 'POST' });
}

export interface LivekitToken {
  token: string;
  url: string;
  roomName: string;
  conversationId: string;
}

export function getLivekitToken(
  personId: string,
  conversationId?: string,
): Promise<LivekitToken> {
  return request<LivekitToken>('/livekit/token', {
    method: 'POST',
    body: JSON.stringify({ personId, conversationId }),
  });
}

export interface ChatFlag {
  stage: 'input' | 'output';
  category: string;
  detail: string;
}

export interface ChatStreamHandlers {
  onMeta?: (meta: { conversationId: string }) => void;
  onDelta?: (text: string) => void;
  onFlag?: (flag: ChatFlag) => void;
  onDone?: (result: { conversationId: string; category: string }) => void;
  onError?: (message: string) => void;
}

/**
 * Parse the API's SSE stream for text chat. POST keeps the message out of the
 * URL, so EventSource is not an option.
 */
export async function streamChat(
  input: { personId: string; conversationId?: string; message: string },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `Chat failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatchFrame(frame, handlers);
      boundary = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) dispatchFrame(buffer, handlers);
}

function dispatchFrame(frame: string, handlers: ChatStreamHandlers): void {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return;

  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }

  switch (event) {
    case 'meta':
      handlers.onMeta?.(data as { conversationId: string });
      break;
    case 'delta':
      handlers.onDelta?.((data as { text: string }).text);
      break;
    case 'flag':
      handlers.onFlag?.(data as ChatFlag);
      break;
    case 'done':
      handlers.onDone?.(data as { conversationId: string; category: string });
      break;
    case 'error':
      handlers.onError?.((data as { message: string }).message);
      break;
    default:
      break;
  }
}
