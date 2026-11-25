/**
 * CI database smoke test. Runs against a real Postgres with the migration
 * applied, exercises the Store SQL, and verifies masking.
 */
import { createDbPool } from '@companion/core';
import { Store } from '../src/services/store.js';

const pool = createDbPool();
const store = new Store(pool);
let personId: string | null = null;

try {
  const person = await store.createPerson({
    name: 'Smoke Test',
    preferredName: 'Smoke',
    interests: ['testing'],
    avoidTopics: [],
    careNotes: 'temporary smoke-test row',
  });
  personId = person.id;

  const conversation = await store.createConversation(person.id, 'text');
  const message = await store.addMessage({
    conversationId: conversation.id,
    role: 'user',
    text: 'my card is 4111 1111 1111 1111',
  });

  if (message.text.includes('4111')) {
    throw new Error('message was not masked before storage');
  }

  await store.addFlags(conversation.id, message.id, 'input', [
    { category: 'scam', detail: 'payment card number detected', source: 'pattern' },
  ]);

  const recent = await store.getRecentMessages(conversation.id, 10);
  const flags = await store.listFlags(conversation.id);
  const people = await store.listPeople();

  if (recent.length !== 1 || flags.length !== 1 || people.length < 1) {
    throw new Error(
      `unexpected counts messages=${recent.length} flags=${flags.length} people=${people.length}`,
    );
  }

  await store.endConversation(conversation.id);

  console.log(
    JSON.stringify({
      ok: true,
      people: people.length,
      messages: recent.length,
      flags: flags.length,
      masked: message.text,
    }),
  );
} finally {
  if (personId) {
    await pool.query('delete from people where id = $1', [personId]);
  }
  await pool.end();
}
