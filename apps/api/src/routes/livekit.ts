import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';
import { livekitTokenRequestSchema } from '@companion/core';
import { config } from '../config.js';
import { ConfigError, NotFoundError } from '../errors.js';
import { getStore } from '../services/store.js';

export const livekitRouter = Router();

livekitRouter.post('/livekit/token', async (req, res) => {
  const parsed = livekitTokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues });
    return;
  }
  const { personId, conversationId } = parsed.data;

  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
    throw new ConfigError('LiveKit is not configured (LIVEKIT_URL/API_KEY/API_SECRET)');
  }

  const store = getStore();
  const person = await store.getPerson(personId);
  if (!person) throw new NotFoundError('Person not found');

  let conversation = conversationId ? await store.getConversation(conversationId) : null;
  if (conversation && conversation.personId !== person.id) {
    throw new NotFoundError('Conversation not found');
  }
  if (!conversation || conversation.mode !== 'voice' || conversation.endedAt) {
    conversation = await store.createConversation(person.id, 'voice');
  }

  const roomName = `companion-${conversation.id}`;
  const metadata = JSON.stringify({
    personId: person.id,
    conversationId: conversation.id,
  });

  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: `person-${person.id}-${randomUUID().slice(0, 8)}`,
    ttl: '2h',
    metadata,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: config.agentName,
        metadata,
      }),
    ],
  });

  res.json({
    token: await token.toJwt(),
    url: config.livekitUrl,
    roomName,
    conversationId: conversation.id,
  });
});
