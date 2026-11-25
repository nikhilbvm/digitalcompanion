-- Optional demo person for local development. Run after 0001_init.sql.
-- Never put real personal data here.

insert into public.people (name, preferred_name, interests, avoid_topics, care_notes)
values (
  'Mary Example',
  'Mary',
  array['gardening', 'old movies', 'crosswords'],
  array['politics'],
  'Lives alone. Daughter visits on Sundays. Hard of hearing in the left ear.'
)
on conflict do nothing;
