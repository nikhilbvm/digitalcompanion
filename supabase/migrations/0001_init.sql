-- Digital Companion — initial schema
-- Run in the Supabase SQL editor or via `supabase db push`.
-- All access is through the service role key from the API/agent. RLS is
-- enabled with no anon/authenticated policies, so the browser cannot read or
-- write these tables directly.

create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preferred_name text not null,
  interests text[] not null default '{}',
  avoid_topics text[] not null default '{}',
  care_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  mode text not null check (mode in ('voice', 'text')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.guardrail_flags (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  stage text not null check (stage in ('input', 'output')),
  category text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.memory_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  text text not null,
  type text,
  source text,
  sensitivity text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);

create index if not exists conversations_person_id_started_at_idx
  on public.conversations (person_id, started_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

create index if not exists guardrail_flags_conversation_id_created_at_idx
  on public.guardrail_flags (conversation_id, created_at desc);

create index if not exists guardrail_flags_message_id_idx
  on public.guardrail_flags (message_id);

create index if not exists memory_notes_person_id_active_idx
  on public.memory_notes (person_id, active);

alter table public.people enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.guardrail_flags enable row level security;
alter table public.memory_notes enable row level security;

comment on table public.people is
  'Companion users. Care notes are sensitive; service role only.';
comment on table public.guardrail_flags is
  'Input/output safety flags. detail must never contain raw identifiers.';
comment on table public.memory_notes is
  'Part 2 memory capture. Only active, non-expired notes are eligible for prompts.';
