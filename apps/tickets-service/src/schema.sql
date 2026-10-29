create table if not exists tickets (
  id text primary key,
  employee_id text not null,
  kind text not null,
  category text not null,
  title text not null,
  description text not null,
  priority text not null,
  status text not null,
  impact text not null,
  created_at timestamptz not null,
  last_update_at timestamptz not null,
  resolved_at timestamptz
);

create index if not exists tickets_employee_idx on tickets (employee_id);

create table if not exists ticket_events (
  id serial primary key,
  ticket_id text not null references tickets (id),
  type text not null,
  body text not null,
  author text not null,
  at timestamptz not null
);

create table if not exists idempotency_keys (
  key text primary key,
  status integer not null,
  response text not null,
  created_at timestamptz not null default now()
);

create sequence if not exists inc_seq start 20520;
create sequence if not exists req_seq start 10450;
