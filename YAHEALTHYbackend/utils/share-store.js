/**
 * Share-card links — persistence.
 *
 * Kept out of utils/database.js on purpose (that file is shared by every
 * feature); same two backends though: the ALLOW_MEMORY_DB store and Supabase
 * table public.share_cards (migrations/016_share_cards.sql).
 *
 * Only a SHA-256 of the token is stored. The token itself is shown to the
 * owner once, at creation, and lives in the URL they share.
 *
 * Every read takes `now` so expiry is testable without waiting 30 days.
 */

const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const db = require('./database');
const { hashToken, SHARE_TTL_MS } = require('./share-card');

const TABLE = 'share_cards';

// RLS is on with no policies (like referrals and marketing_leads), so the
// service-role key is what can reach the table; the anon client is the
// fallback for setups that have not configured one.
let client = null;
function supabase() {
  if (!client) {
    client = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : db.supabase;
  }
  return client;
}

/** token_hash → row */
const memory = new Map();

const isLive = (row, now) =>
  row && !row.revoked_at && new Date(row.expires_at).getTime() > now.getTime();

async function createShareCard({ token, userId, snapshot, refCode, now = new Date() }) {
  const row = {
    id: randomUUID(),
    token_hash: hashToken(token),
    user_id: userId,
    snapshot,
    ref_code: refCode || null,
    lang: snapshot.lang,
    image_png: null,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SHARE_TTL_MS).toISOString(),
    revoked_at: null
  };

  if (db.isMemoryMode()) {
    memory.set(row.token_hash, row);
    return row;
  }

  const { data, error } = await supabase().from(TABLE).insert([row]).select().single();
  if (error) throw error;
  return data;
}

async function findRow(token) {
  const hash = hashToken(token);
  if (db.isMemoryMode()) return memory.get(hash) || null;
  const { data, error } = await supabase().from(TABLE).select('*').eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** The live share for a token, or null (unknown, expired, revoked alike). */
async function getLiveShareCard(token, now = new Date()) {
  const row = await findRow(token);
  if (!isLive(row, now)) return null;
  // On Supabase, deleting the account cascades to share_cards. This Map has
  // no foreign key, so without this check a deleted user's week (and first
  // name) would stay public until the link expired.
  if (db.isMemoryMode() && !(await db.getUser(row.user_id))) {
    memory.delete(row.token_hash);
    return null;
  }
  return row;
}

/**
 * Owner-only revoke.
 *   { ok: true } · { ok: false, reason: 'not_found' | 'forbidden' }
 * Already-revoked counts as ok (idempotent DELETE).
 */
async function revokeShareCard(token, userId, now = new Date()) {
  const row = await findRow(token);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.user_id !== userId) return { ok: false, reason: 'forbidden' };
  if (row.revoked_at) return { ok: true };

  const revokedAt = now.toISOString();
  if (db.isMemoryMode()) {
    row.revoked_at = revokedAt;
    row.image_png = null;
    return { ok: true };
  }
  const { error } = await supabase()
    .from(TABLE)
    .update({ revoked_at: revokedAt, image_png: null })
    .eq('id', row.id);
  if (error) throw error;
  return { ok: true };
}

/** Attach the owner's PNG render (base64 at rest — see the migration). */
async function setShareCardImage(token, userId, pngBuffer, now = new Date()) {
  const row = await findRow(token);
  if (!row || !isLive(row, now)) return { ok: false, reason: 'not_found' };
  if (row.user_id !== userId) return { ok: false, reason: 'forbidden' };

  const encoded = pngBuffer.toString('base64');
  if (db.isMemoryMode()) {
    row.image_png = encoded;
    return { ok: true };
  }
  const { error } = await supabase().from(TABLE).update({ image_png: encoded }).eq('id', row.id);
  if (error) throw error;
  return { ok: true };
}

/** How many links this user made since `since` — a per-user creation cap. */
async function countCreatedSince(userId, since) {
  if (db.isMemoryMode()) {
    let n = 0;
    for (const row of memory.values()) {
      if (row.user_id === userId && row.created_at >= since.toISOString()) n++;
    }
    return n;
  }
  const { count, error } = await supabase()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since.toISOString());
  if (error) throw error;
  return count || 0;
}

module.exports = {
  createShareCard,
  getLiveShareCard,
  revokeShareCard,
  setShareCardImage,
  countCreatedSince,
  _memory: memory
};
