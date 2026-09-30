#!/usr/bin/env node
/**
 * One-off, after migrations/018: record in health_flags everyone who told us
 * about a health condition before the table existed.
 *
 * The migration's SQL covers the escalations it can see by status. What it
 * cannot see needs the flag list itself (utils/health-flags.js), which is
 * JavaScript: inbox messages a person already marked handled (their status is
 * 'answered' now), the bot's own conversation log, and booking notes. This
 * reads those texts, runs the same list over them, and records the phone. It
 * prints counts only; no message text leaves this process, and none is stored.
 *
 *   node scripts/backfill-health-flags.js           counts, writes nothing
 *   node scripts/backfill-health-flags.js --apply   records them
 *
 * Needs SUPABASE_URL and a server key (SUPABASE_SERVICE_ROLE_KEY, or a
 * SUPABASE_KEY that is one). Safe to run more than once: a phone already
 * recorded is only touched, never duplicated.
 */
require('dotenv').config();
const { isFlagged } = require('../utils/health-flags');

/**
 * The phones to record, from rows as the three tables hold them. Kept apart
 * from the database so a test can cover exactly which rows count.
 */
function flaggedPhones({ inbox = [], bot = [], bookings = [] }) {
  const phones = new Set();
  const counts = { inbox: 0, bot: 0, bookings: 0 };
  const add = (phone, channel) => {
    if (!phone) return;
    phones.add(phone);
    counts[channel]++;
  };
  for (const m of inbox) {
    // Our own replies come back through the inbox hook too.
    if (m.from_me || !isFlagged(m.body)) continue;
    // In a group the chat is the group; the person is the sender.
    add(String(m.chat_id || '').endsWith('@g.us') ? m.from_number : m.chat_id || m.from_number, 'inbox');
  }
  for (const m of bot) {
    if (m.role === 'user' && isFlagged(m.content)) add(m.phone, 'bot');
  }
  for (const a of bookings) {
    if (isFlagged(a.notes)) add(a.phone, 'bookings');
  }
  return { phones, counts };
}

async function readAll(client, table, columns) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and a server key are required. Nothing was read.');
    process.exitCode = 1;
    return;
  }
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(url, key);

  const { phones, counts } = flaggedPhones({
    inbox: await readAll(client, 'whatsapp_messages', 'chat_id, from_number, from_me, body'),
    bot: await readAll(client, 'whapi_messages', 'phone, role, content'),
    bookings: await readAll(client, 'appointments', 'phone, notes')
  });
  console.log(`flagged texts: ${counts.inbox} inbox, ${counts.bot} bot, ${counts.bookings} booking notes`);
  console.log(`people: ${phones.size}`);

  if (!apply) {
    console.log('dry run: nothing written. Run again with --apply to record them.');
    return;
  }
  const db = require('../utils/database');
  let recorded = 0;
  for (const phone of phones) recorded += await db.recordHealthFlag({ phone, source: 'backfill' });
  console.log(`recorded ${recorded} in health_flags`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('backfill failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { flaggedPhones };
