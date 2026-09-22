-- Renames the internal bot identifier from 'nuri' to 'adi'.
--
-- Persona history: Nuri -> Mor -> Adi. The first two renames only ever
-- touched user-facing prose (docs/bot/nuri-bot-prompt.md, routes/whapi.js
-- strings) -- migrations/001 hardcoded the original name as stored data
-- (the default and the check constraint below), and that survived both
-- renames until now.
--
-- No longer a hard prerequisite for deploying the code that writes 'adi' as
-- active_bot: utils/database.js (getWhapiConversation/upsertWhapiConversation)
-- now normalizes at the boundary -- a write of 'adi' that hits this
-- constraint before it's been updated retries once with the legacy 'nuri'
-- value instead of failing, and a row read back as 'nuri' is returned as
-- 'adi' -- so an existing conversation never loses its system prompt
-- (SYSTEM_PROMPTS keyed by 'adi', not 'nuri') either way. Run this whenever
-- convenient regardless: it's the real fix (the stored data matches the
-- code's vocabulary, so anyone reading the table directly -- e.g. in the
-- Supabase dashboard -- isn't confused by a stale 'nuri'), the fallback in
-- database.js is a safety net, not a replacement for it. Once this has run,
-- that fallback path simply never triggers again.
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
