-- Renames the internal bot identifier from 'nuri' to 'adi'.
--
-- Persona history: Nuri -> Mor -> Adi. The first two renames only ever
-- touched user-facing prose (docs/bot/nuri-bot-prompt.md, routes/whapi.js
-- strings) -- migrations/001 hardcoded the original name as stored data
-- (the default and the check constraint below), and that survived both
-- renames until now.
--
-- Run this in the Supabase SQL editor BEFORE deploying the code that writes
-- 'adi' as active_bot (routes/whapi.js, utils/whapi-brain.js). Until this
-- runs, the check constraint still only allows 'nuri'/'chef', so any write
-- of 'adi' fails with a constraint violation -- and if the code's
-- SYSTEM_PROMPTS map no longer has a 'nuri' key, an existing conversation
-- still tagged 'nuri' would get a reply generated with no system prompt at
-- all (no safety layer), not just an error. The UPDATE below is what
-- prevents that: it migrates existing rows in the same transaction as the
-- constraint change.
--
-- Rollback:
--   alter table whapi_conversations drop constraint if exists whapi_conversations_active_bot_check;
--   update whapi_conversations set active_bot = 'nuri' where active_bot = 'adi';
--   alter table whapi_conversations alter column active_bot set default 'nuri';
--   alter table whapi_conversations add constraint whapi_conversations_active_bot_check check (active_bot in ('nuri', 'chef'));

begin;

alter table whapi_conversations drop constraint if exists whapi_conversations_active_bot_check;

update whapi_conversations set active_bot = 'adi' where active_bot = 'nuri';

alter table whapi_conversations alter column active_bot set default 'adi';

alter table whapi_conversations
  add constraint whapi_conversations_active_bot_check check (active_bot in ('adi', 'chef'));

commit;
