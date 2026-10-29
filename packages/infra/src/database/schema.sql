create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null,
  department text not null,
  team text
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references users (id),
  status text not null,
  assigned_analyst_id text references users (id),
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  resolution text
);

create index if not exists conversations_employee_idx on conversations (employee_id, status);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id),
  author text not null,
  author_name text not null,
  blocks jsonb not null,
  trace jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

create table if not exists knowledge_articles (
  slug text primary key,
  title text not null,
  body text not null,
  applies_to text,
  search tsvector generated always as (to_tsvector('portuguese', title || ' ' || body || ' ' || coalesce(applies_to, ''))) stored
);

create index if not exists knowledge_articles_search_idx on knowledge_articles using gin (search);
