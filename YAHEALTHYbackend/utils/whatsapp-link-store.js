/**
 * Log-from-WhatsApp — persistence (migrations/024_whatsapp_food_logging.sql).
 *
 * Kept out of utils/database.js on purpose (that file is shared by every
 * feature); same two backends though: the ALLOW_MEMORY_DB store and Supabase.
 * RLS is on with no policies, so the service-role key is what reaches these
 * tables; the anon client is the fallback for setups without one.
 *
 * The atomic steps are atomic in both backends:
 *   - claimInboundMessage: insert-or-conflict on the WHAPI message id.
 *   - consumeLinkCode: update … where used_at is null and not revoked and
 *     not expired, returning the row — only one caller gets it.
 *   - transitionPending: update … where status = <expected>, returning.
 *   - one live pending entry per phone: a partial unique index.
 * Every read and write takes `now` so expiry is testable without waiting.
 */

const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const db = require('./database');

let client = null;
function supabase() {
  if (!client) {
    client = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : db.supabase;
  }
  return client;
}

const UNIQUE_VIOLATION = '23505';
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

const memory = {
  inbound: new Set(),
  state: new Map(), // phone → { phone, escalated_at, link_invited_at, updated_at }
  codes: [], // { id, user_id, code_hash, created_at, expires_at, used_at, revoked_at }
  attempts: [], // { id, phone, created_at }
  links: new Map(), // user_id → { user_id, phone, linked_at }
  pending: [] // whatsapp_pending_logs rows
};

/** Test hook: forget the in-memory tables. */
function _resetMemory() {
  memory.inbound.clear();
  memory.state.clear();
  memory.codes.length = 0;
  memory.attempts.length = 0;
  memory.links.clear();
  memory.pending.length = 0;
}

// ─── inbound de-duplication ─────────────────────────────────────────────────

/**
 * True the first time a WHAPI message id is seen, false on every redelivery.
 * A message with no id cannot be de-duplicated and is treated as new.
 */
async function claimInboundMessage(messageId, now = new Date()) {
  if (!messageId) return true;
  const id = String(messageId);
  if (db.isMemoryMode()) {
    if (memory.inbound.has(id)) return false;
    memory.inbound.add(id);
    return true;
  }
  const { error } = await supabase()
    .from('whatsapp_inbound_messages')
    .insert([{ message_id: id, received_at: iso(now) }]);
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw error;
}

// ─── conversation state (escalation, invite throttle) ───────────────────────

async function getConversationState(phone) {
  if (db.isMemoryMode()) return memory.state.get(phone) || null;
  const { data, error } = await supabase()
    .from('whatsapp_conversation_state')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function patchConversationState(phone, patch, now = new Date()) {
  if (db.isMemoryMode()) {
    const row = { phone, escalated_at: null, link_invited_at: null, ...(memory.state.get(phone) || {}), ...patch, updated_at: iso(now) };
    memory.state.set(phone, row);
    return row;
  }
  const { data, error } = await supabase()
    .from('whatsapp_conversation_state')
    .upsert({ phone, ...patch, updated_at: iso(now) }, { onConflict: 'phone' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Sticky: the first escalation time is kept. */
async function markEscalated(phone, now = new Date()) {
  const current = await getConversationState(phone);
  if (current?.escalated_at) return current;
  return patchConversationState(phone, { escalated_at: iso(now) }, now);
}

async function markInvited(phone, now = new Date()) {
  return patchConversationState(phone, { link_invited_at: iso(now) }, now);
}

// ─── link codes ─────────────────────────────────────────────────────────────

async function countCodesSince(userId, since) {
  if (db.isMemoryMode()) {
    return memory.codes.filter((c) => c.user_id === userId && c.created_at >= iso(since)).length;
  }
  const { count, error } = await supabase()
    .from('whatsapp_link_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', iso(since));
  if (error) throw error;
  return count || 0;
}

async function revokeCodesForUser(userId, now = new Date()) {
  if (db.isMemoryMode()) {
    for (const c of memory.codes) {
      if (c.user_id === userId && !c.used_at && !c.revoked_at) c.revoked_at = iso(now);
    }
    return;
  }
  const { error } = await supabase()
    .from('whatsapp_link_codes')
    .update({ revoked_at: iso(now) })
    .eq('user_id', userId)
    .is('used_at', null)
    .is('revoked_at', null);
  if (error) throw error;
}

/** A new code replaces every earlier unused one for this account. */
async function issueLinkCode({ userId, codeHash, ttlMs, now = new Date() }) {
  await revokeCodesForUser(userId, now);
  const row = {
    id: randomUUID(),
    user_id: userId,
    code_hash: codeHash,
    created_at: iso(now),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    used_at: null,
    revoked_at: null
  };
  if (db.isMemoryMode()) {
    memory.codes.push(row);
    return row;
  }
  const { data, error } = await supabase().from('whatsapp_link_codes').insert([row]).select().single();
  if (error) throw error;
  return data;
}

/** The live, unused code with this hash — marked used in the same step — or null. */
async function consumeLinkCode(codeHash, now = new Date()) {
  const nowIso = iso(now);
  if (db.isMemoryMode()) {
    const row = memory.codes.find(
      (c) => c.code_hash === codeHash && !c.used_at && !c.revoked_at && c.expires_at > nowIso
    );
    if (!row) return null;
    row.used_at = nowIso;
    return { ...row };
  }
  const { data, error } = await supabase()
    .from('whatsapp_link_codes')
    .update({ used_at: nowIso })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Put a consumed code back (the link could not be made, e.g. phone taken). */
async function releaseLinkCode(codeId) {
  if (db.isMemoryMode()) {
    const row = memory.codes.find((c) => c.id === codeId);
    if (row) row.used_at = null;
    return;
  }
  const { error } = await supabase().from('whatsapp_link_codes').update({ used_at: null }).eq('id', codeId);
  if (error) throw error;
}

async function countFailedAttemptsSince(phone, since) {
  if (db.isMemoryMode()) {
    return memory.attempts.filter((a) => a.phone === phone && a.created_at >= iso(since)).length;
  }
  const { count, error } = await supabase()
    .from('whatsapp_link_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', iso(since));
  if (error) throw error;
  return count || 0;
}

async function recordFailedAttempt(phone, now = new Date()) {
  const row = { id: randomUUID(), phone, created_at: iso(now) };
  if (db.isMemoryMode()) {
    memory.attempts.push(row);
    return;
  }
  const { error } = await supabase().from('whatsapp_link_attempts').insert([row]);
  if (error) throw error;
}

// ─── links ──────────────────────────────────────────────────────────────────

async function getLinkByUser(userId) {
  if (db.isMemoryMode()) return memory.links.get(userId) || null;
  const { data, error } = await supabase().from('whatsapp_links').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getLinkByPhone(phone) {
  if (db.isMemoryMode()) {
    for (const link of memory.links.values()) if (link.phone === phone) return link;
    return null;
  }
  const { data, error } = await supabase().from('whatsapp_links').select('*').eq('phone', phone).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Link `phone` to `userId`, replacing the account's previous number.
 * Throws { code: 'PHONE_TAKEN' } when another account holds this number.
 */
async function createLink(userId, phone, now = new Date()) {
  const row = { user_id: userId, phone, linked_at: iso(now) };
  if (db.isMemoryMode()) {
    for (const link of memory.links.values()) {
      if (link.phone === phone && link.user_id !== userId) {
        const err = new Error('Phone already linked to another account');
        err.code = 'PHONE_TAKEN';
        throw err;
      }
    }
    memory.links.set(userId, row);
    return row;
  }
  const { data, error } = await supabase()
    .from('whatsapp_links')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const err = new Error('Phone already linked to another account');
      err.code = 'PHONE_TAKEN';
      throw err;
    }
    throw error;
  }
  return data;
}

async function deleteLink(userId) {
  if (db.isMemoryMode()) return memory.links.delete(userId);
  const { data, error } = await supabase().from('whatsapp_links').delete().eq('user_id', userId).select('user_id');
  if (error) throw error;
  return Boolean(data && data.length);
}

// ─── pending entries ────────────────────────────────────────────────────────

async function getLatestPending(phone) {
  if (db.isMemoryMode()) {
    const rows = memory.pending.filter((p) => p.phone === phone);
    return rows.length ? { ...rows[rows.length - 1] } : null;
  }
  const { data, error } = await supabase()
    .from('whatsapp_pending_logs')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Move a pending entry from `from` to `to` (plus any extra columns) — only if
 * it is still in `from`. Returns the updated row, or null when someone else
 * already moved it: the one caller that gets a row is the one that acts.
 */
async function transitionPending(id, from, to, extra = {}, now = new Date()) {
  const patch = { status: to, ...extra };
  if (to !== 'pending') patch.resolved_at = iso(now);
  if (to === 'pending') patch.resolved_at = null;
  if (db.isMemoryMode()) {
    const row = memory.pending.find((p) => p.id === id);
    if (!row || row.status !== from) return null;
    Object.assign(row, patch);
    return { ...row };
  }
  const { data, error } = await supabase()
    .from('whatsapp_pending_logs')
    .update(patch)
    .eq('id', id)
    .eq('status', from)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Edit a still-pending entry (slot/date/portion correction). */
async function updatePendingFields(id, fields) {
  if (db.isMemoryMode()) {
    const row = memory.pending.find((p) => p.id === id && p.status === 'pending');
    if (!row) return null;
    Object.assign(row, fields);
    return { ...row };
  }
  const { data, error } = await supabase()
    .from('whatsapp_pending_logs')
    .update(fields)
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Close every live entry for a phone (new proposal, escalation, unlink). */
async function closePendingForPhone(phone, status, now = new Date()) {
  if (db.isMemoryMode()) {
    for (const p of memory.pending) {
      if (p.phone === phone && p.status === 'pending') Object.assign(p, { status, resolved_at: iso(now) });
    }
    return;
  }
  const { error } = await supabase()
    .from('whatsapp_pending_logs')
    .update({ status, resolved_at: iso(now) })
    .eq('phone', phone)
    .eq('status', 'pending');
  if (error) throw error;
}

async function closePendingForUser(userId, status, now = new Date()) {
  if (db.isMemoryMode()) {
    for (const p of memory.pending) {
      if (p.user_id === userId && p.status === 'pending') Object.assign(p, { status, resolved_at: iso(now) });
    }
    return;
  }
  const { error } = await supabase()
    .from('whatsapp_pending_logs')
    .update({ status, resolved_at: iso(now) })
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
}

/** A new proposal supersedes any live one for the same phone. */
async function createPending({ phone, userId, items, mealType, logDate, tz, sourceMessageId, ttlMs, now = new Date() }) {
  await closePendingForPhone(phone, 'superseded', now);
  const row = {
    id: randomUUID(),
    phone,
    user_id: userId,
    status: 'pending',
    items,
    meal_type: mealType,
    log_date: logDate,
    tz,
    source_message_id: sourceMessageId || null,
    food_log_ids: null,
    created_at: iso(now),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    resolved_at: null
  };
  if (db.isMemoryMode()) {
    memory.pending.push(row);
    return { ...row };
  }
  const { data, error } = await supabase().from('whatsapp_pending_logs').insert([row]).select().single();
  if (error) throw error;
  return data;
}

// ─── the write itself ───────────────────────────────────────────────────────

/**
 * Insert one food_logs row unless a row with the same (user_id, source_ref)
 * already exists. On Supabase the partial unique index decides; in memory the
 * same check is done by hand.
 */
async function insertFoodLogOnce(userId, row) {
  if (db.isMemoryMode()) {
    const existing = (await db.getFoodLogs(userId, { date: row.date })).find((r) => r.source_ref === row.source_ref);
    if (existing) return { row: existing, duplicate: true };
    return { row: await db.createFoodLog(userId, row), duplicate: false };
  }
  try {
    return { row: await db.createFoodLog(userId, row), duplicate: false };
  } catch (error) {
    if (error && error.code === UNIQUE_VIOLATION) return { row: null, duplicate: true };
    throw error;
  }
}

module.exports = {
  claimInboundMessage,
  getConversationState,
  markEscalated,
  markInvited,
  countCodesSince,
  revokeCodesForUser,
  issueLinkCode,
  consumeLinkCode,
  releaseLinkCode,
  countFailedAttemptsSince,
  recordFailedAttempt,
  getLinkByUser,
  getLinkByPhone,
  createLink,
  deleteLink,
  getLatestPending,
  transitionPending,
  updatePendingFields,
  closePendingForPhone,
  closePendingForUser,
  createPending,
  insertFoodLogOnce,
  _resetMemory
};
