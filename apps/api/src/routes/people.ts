import { Router } from 'express';
import { z } from 'zod';
import { newPersonSchema } from '@companion/core';
import { NotFoundError } from '../errors.js';
import { getStore } from '../services/store.js';

export const peopleRouter = Router();

peopleRouter.get('/people', async (_req, res) => {
  const people = await getStore().listPeople();
  res.json({ people });
});

peopleRouter.post('/people', async (req, res) => {
  const parsed = newPersonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues });
    return;
  }

  const person = await getStore().createPerson(parsed.data);
  res.status(201).json({ person });
});

peopleRouter.put('/people/:id', async (req, res) => {
  const idParsed = z.uuid().safeParse(req.params.id);
  if (!idParsed.success) throw new NotFoundError('Person not found');

  const parsed = newPersonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues });
    return;
  }

  const person = await getStore().updatePerson(idParsed.data, parsed.data);
  res.json({ person });
});
