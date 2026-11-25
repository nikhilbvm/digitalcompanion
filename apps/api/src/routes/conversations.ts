import { Router } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../errors.js';
import { getStore } from '../services/store.js';

export const conversationsRouter = Router();

conversationsRouter.get('/conversations', async (req, res) => {
  const personIdRaw = req.query.personId;
  let personId: string | undefined;

  if (typeof personIdRaw === 'string' && personIdRaw.length > 0) {
    const parsed = z.uuid().safeParse(personIdRaw);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request', message: 'personId must be a UUID' });
      return;
    }
    personId = parsed.data;
  }

  const conversations = await getStore().listConversations(personId);
  res.json({ conversations });
});

conversationsRouter.get('/conversations/:id', async (req, res) => {
  const idParsed = z.uuid().safeParse(req.params.id);
  if (!idParsed.success) throw new NotFoundError('Conversation not found');

  const store = getStore();
  const conversation = await store.getConversation(idParsed.data);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const [person, messages, flags] = await Promise.all([
    store.getPerson(conversation.personId),
    store.listMessages(conversation.id),
    store.listFlags(conversation.id),
  ]);
  if (!person) throw new NotFoundError('Person not found');

  res.json({ conversation, person, messages, flags });
});

conversationsRouter.post('/conversations/:id/end', async (req, res) => {
  const idParsed = z.uuid().safeParse(req.params.id);
  if (!idParsed.success) throw new NotFoundError('Conversation not found');

  const conversation = await getStore().endConversation(idParsed.data);
  res.json({ conversation });
});
