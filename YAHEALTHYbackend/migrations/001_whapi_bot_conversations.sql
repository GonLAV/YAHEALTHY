-- First migration in this repo (ADR-002 follow-up, decisions.md step 4).
-- Run in the Supabase SQL editor before the WHAPI webhook goes live.
--
-- Rollback:
--   drop table if exists whapi_messages;
--   drop table if exists whapi_conversations;

create table if not exists whapi_conversations (
  phone text primary key,
  active_bot text not null default 'nuri' check (active_bot in ('nuri', 'chef')),
  updated_at timestamptz not null default now()
);

create table if not exists whapi_messages (
  id bigint generated always as identity primary key,
  phone text not null references whapi_conversations(phone) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Covers both the FK lookup and the actual query pattern (recent messages per phone).
create index if not exists whapi_messages_phone_created_idx
  on whapi_messages (phone, created_at);

-- These tables are written only by the backend server, never read directly by a
-- client. RLS is enabled with no policies, so the anon/authenticated roles get
-- zero access by default; only the Postgres service_role (which bypasses RLS)
-- can read or write them.
--
-- The rest of this app's tables connect via SUPABASE_KEY, documented in
-- .env.example as the anon key. If that is what's actually configured, the
-- webhook's DB calls will fail against these two tables until the backend
-- also has a service-role key. Add SUPABASE_SERVICE_ROLE_KEY (Supabase
-- dashboard -> Settings -> API) and use it for the four whapi* functions in
-- utils/database.js -- see the comment there.
alter table whapi_conversations enable row level security;
alter table whapi_messages enable row level security;
