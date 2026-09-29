const { createClient } = require('@supabase/supabase-js');
const { randomUUID: uuidv4 } = require('crypto');
const { normalizePhone } = require('./phone');
const logger = require('./logger');
const { rankFoodMatches, withCatalogAliases, namesForSynonym } = require('./food-logging');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const SUPABASE_CONFIGURED =
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_KEY) &&
  SUPABASE_URL !== 'https://your-supabase-url.supabase.co' &&
  SUPABASE_KEY !== 'your-supabase-anon-key';

// ADR-001 chose Supabase. Falling back to memory silently means every restart
// discards user data — including weight, sleep and survey records — with no
// error raised, so the fallback now has to be asked for explicitly.
if (!SUPABASE_CONFIGURED) {
  if (IS_PRODUCTION) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_KEY are required in production. Refusing to start: ' +
      'the in-memory store loses all user data on every restart.'
    );
  }
  if (process.env.ALLOW_MEMORY_DB !== 'true') {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY, or set ' +
      'ALLOW_MEMORY_DB=true to run against the in-memory store (data is lost on restart).'
    );
  }
  console.warn('[db] Running on the in-memory store via ALLOW_MEMORY_DB. Data is lost on restart.');
}

const USE_MEMORY_DB = !SUPABASE_CONFIGURED;

// Initialize Supabase client (only used when configured)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// whapi_conversations/whapi_messages (migrations/001) have RLS enabled with no
// policies, so SUPABASE_KEY (the anon key, per .env.example) has zero access to
// them by design -- only a service-role key bypasses RLS. Falls back to the
// anon client so memory-mode/dev keeps working; against a real RLS-enabled
// table without this key set, the four whapi* functions below will fail loudly.
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabase;

const memoryDb = {
  usersById: new Map(),
  usersByEmail: new Map(),
  surveys: [],
  weightGoals: [],
  weightLogs: [],
  hydrationLogs: [],
  sleepLogs: [],
  fastingWindows: [],
  mealSwaps: [],
  whatsappMessages: [],
  readinessScores: [],
  offlineLogs: [],
  foodLogs: [],
  foodLogTemplates: [],
  mealPlans: [],
  subscriptions: [],
  paymentEvents: [],
  leads: [],
  chefRequests: [],
  foods: [],
  whapiConversations: new Map(),
  whapiMessages: [],
  referrals: [],
  referralRewards: [],
  // Lifecycle messaging (migrations/018). Sends are keyed by recipient_id,
  // not user_id, because a recipient can be a lead — deleteUser clears them
  // by hand.
  notificationPrefs: new Map(),
  lifecycleSends: [],
  pushSubscriptions: [],
  pushReminderSettings: []
};

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function maybeLogMemoryMode() {
  if (!USE_MEMORY_DB) return;
  if (global.__YAHEALTHY_MEMORY_DB_LOGGED__) return;
  global.__YAHEALTHY_MEMORY_DB_LOGGED__ = true;
  console.warn('⚠️ Supabase not configured; using in-memory DB (dev only).');
}

function normalizeFoodLogRow(row) {
  if (!row) return row;
  return {
    ...row,
    meal_type: row.meal_type ?? null,
    protein_grams: row.protein_grams ?? null,
    carbs_grams: row.carbs_grams ?? null,
    fat_grams: row.fat_grams ?? null,
    notes: row.notes ?? null,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    food_id: row.food_id ?? null
  };
}

function normalizeFoodLogTemplateRow(row) {
  if (!row) return row;
  const items = Array.isArray(row.items) ? row.items : null;
  return {
    ...normalizeFoodLogRow(row),
    kind: row.kind || (items ? 'meal' : 'food'),
    items
  };
}

// Columns added by migrations/023. Until it is applied to a database, an
// insert that names them fails with "column not found"; logging a meal must
// keep working meanwhile, so those inserts are retried without them.
const MIGRATION_023_COLUMNS = ['quantity', 'unit', 'food_id'];
let warnedMissing023 = false;

function isMissingColumnError(error) {
  return Boolean(error) && (error.code === 'PGRST204' || error.code === '42703');
}

async function insertWithOptionalColumns(table, rows) {
  const run = (payload) => supabase.from(table).insert(payload).select('*');
  let { data, error } = await run(rows);
  if (isMissingColumnError(error)) {
    if (!warnedMissing023) {
      warnedMissing023 = true;
      logger.warn('food logging: migration 023 not applied; saving without quantity/unit/food_id', { table });
    }
    const stripped = rows.map((r) => {
      const copy = { ...r };
      for (const c of MIGRATION_023_COLUMNS) delete copy[c];
      return copy;
    });
    ({ data, error } = await run(stripped));
  }
  if (error) throw error;
  return data || [];
}

/**
 * Initialize database tables (run once)
 */
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database schema...');
    // Schema creation is handled by Supabase migrations
    // This function is a placeholder for future migrations
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

function isMemoryMode() {
  return USE_MEMORY_DB;
}

async function ping() {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return { ok: true, mode: 'memory' };
  }

  const { error } = await supabase
    .from('users')
    .select('id')
    .limit(1);

  if (error) {
    return { ok: false, mode: 'supabase', error: error.message };
  }

  return { ok: true, mode: 'supabase' };
}

/**
 * Get user by ID
 */
async function getUser(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.usersById.get(userId) || null;
  }
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.usersByEmail.get(String(email || '').toLowerCase()) || null;
  }
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get all users (weekly summary email job)
 */
async function getAllUsers() {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return Array.from(memoryDb.usersById.values());
  }
  // Paged: a single request stops at Supabase's row cap (1000), which would
  // silently leave everyone after that out of the lifecycle run and the
  // weekly summary.
  return selectAllPages(() =>
    supabase
      .from('users')
      .select('id, email, name, phone, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  );
}

/**
 * Create user
 */
async function createUser(email, passwordHash, name) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const normalizedEmail = String(email || '').toLowerCase();
    if (memoryDb.usersByEmail.has(normalizedEmail)) {
      const err = new Error('User already exists');
      err.code = 'USER_EXISTS';
      throw err;
    }
    const userId = uuidv4();
    const user = {
      id: userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      name: name || normalizedEmail.split('@')[0] || 'user',
      preferences: null,
      token_version: 0,
      created_at: new Date().toISOString()
    };
    memoryDb.usersById.set(userId, user);
    memoryDb.usersByEmail.set(normalizedEmail, user);
    return user;
  }
  const userId = uuidv4();
  const { data, error } = await supabase
    .from('users')
    .insert([
      {
        id: userId,
        email,
        password_hash: passwordHash,
        name: name || email.split('@')[0],
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Update user password hash
 */
async function updateUserPasswordHash(userId, passwordHash) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    const updated = { ...user, password_hash: passwordHash };
    memoryDb.usersById.set(userId, updated);
    memoryDb.usersByEmail.set(String(updated.email || '').toLowerCase(), updated);
    return updated;
  }

  const { data, error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', userId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Raise the user's token version, which invalidates every token already
 * issued to them. This is what makes a signed JWT revocable: logout, a
 * password change and a password reset all call it, and any token carrying
 * the old value is refused from that moment on.
 *
 * Returns the new version. Throws rather than reporting success for a
 * revocation that did not happen — a logout that silently fails is worse
 * than one that errors.
 */
async function bumpTokenVersion(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    const updated = { ...user, token_version: (user.token_version || 0) + 1 };
    memoryDb.usersById.set(userId, updated);
    memoryDb.usersByEmail.set(String(updated.email || '').toLowerCase(), updated);
    return updated.token_version;
  }

  // Read-then-write only races when the same user revokes twice at once, and
  // the loser of that race still writes a number higher than the tokens being
  // revoked carry — so every one of them is refused either way.
  const current = await getUser(userId);
  if (!current) return null;

  const { data, error } = await supabase
    .from('users')
    .update({ token_version: (current.token_version || 0) + 1 })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data.token_version;
}

/**
 * Delete a user and everything held about them.
 *
 * Against Supabase this is a single delete: all eleven tables that hold user
 * data reference users(id) with ON DELETE CASCADE, so the database removes
 * them atomically. Doing it as eleven separate deletes would leave a person
 * half-deleted whenever one of them failed.
 *
 * Not covered, and deliberately not hidden: whatsapp_messages is keyed by
 * phone number rather than by account, so it is outside this delete and needs
 * a retention policy of its own.
 */
async function deleteUser(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return false;

    memoryDb.usersById.delete(userId);
    memoryDb.usersByEmail.delete(String(user.email || '').toLowerCase());

    // The cascade has to be written out here, because a Map and a handful of
    // arrays have no foreign keys to do it for us.
    for (const [key, value] of Object.entries(memoryDb)) {
      if (Array.isArray(value)) {
        memoryDb[key] = value.filter((row) => row.user_id !== userId);
      }
    }
    // Referrals key on two user columns rather than user_id.
    memoryDb.referrals = memoryDb.referrals.filter(
      (row) => row.referrer_id !== userId && row.referee_id !== userId
    );
    memoryDb.notificationPrefs.delete(userId);
    memoryDb.lifecycleSends = memoryDb.lifecycleSends.filter(
      (row) => !(row.recipient_type === 'user' && row.recipient_id === userId)
    );
    return true;
  }

  // lifecycle_sends has no foreign key (a recipient may be a lead), so the
  // cascade cannot reach it. Best effort: the account delete is what the
  // person asked for and must not fail over the send log.
  try {
    await deleteLifecycleSendsFor('user', userId);
  } catch (error) {
    console.warn(`[db] lifecycle sends not cleared for deleted user ${userId}: ${error.message}`);
  }

  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
  return true;
}

/**
 * Referrals — who invited whom, and what that earned.
 *
 * Three pieces of state: a code on the user row (generated lazily, the first
 * time someone asks for it), a referrals row per referee, and a rewards row
 * per earned reward. Uniqueness lives in constraints (users.referral_code,
 * referrals.referee_id, referral_rewards.referral_id) so two concurrent
 * signups cannot both win; memory mode mirrors those checks by hand.
 */
function replaceMemoryUser(updated) {
  memoryDb.usersById.set(updated.id, updated);
  memoryDb.usersByEmail.set(String(updated.email || '').toLowerCase(), updated);
  return updated;
}

async function getUserByReferralCode(code) {
  if (!code) return null;

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    for (const user of memoryDb.usersById.values()) {
      if (user.referral_code === code) return user;
    }
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, referral_code')
    .eq('referral_code', code)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * The user's referral code, created on first request.
 *
 * A collision with someone else's code is retried with a fresh one; a race
 * with a concurrent request for the *same* user resolves to whichever write
 * landed first, because the update only applies while the column is null.
 */
async function ensureReferralCode(userId, generate) {
  const MAX_ATTEMPTS = 5;

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    if (user.referral_code) return user.referral_code;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = generate();
      if (await getUserByReferralCode(code)) continue;
      replaceMemoryUser({ ...user, referral_code: code });
      return code;
    }
    throw new Error(`Could not allocate a referral code for user ${userId}`);
  }

  const current = await getUser(userId);
  if (!current) return null;
  if (current.referral_code) return current.referral_code;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generate();
    const { error } = await supabase
      .from('users')
      .update({ referral_code: code })
      .eq('id', userId)
      .is('referral_code', null);

    // 23505: another user already holds this code. Try a different one.
    if (error && error.code === '23505') continue;
    if (error) throw error;

    // Re-read rather than trusting `code`: a concurrent request may have set
    // the column first, in which case our conditional update matched nothing.
    const after = await getUser(userId);
    if (after && after.referral_code) return after.referral_code;
  }
  throw new Error(`Could not allocate a referral code for user ${userId}`);
}

/**
 * First-touch marketing attribution, stored once at signup.
 */
async function setUserAttribution(userId, attribution) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    return replaceMemoryUser({ ...user, attribution });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ attribution })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Marks onboarding done (finished or skipped). Only the first call writes:
 * re-running the wizard later keeps the original date.
 */
async function setOnboardingCompletedAt(userId, at = new Date().toISOString()) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    if (user.onboarding_completed_at) return user;
    return replaceMemoryUser({ ...user, onboarding_completed_at: at });
  }

  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed_at: at })
    .eq('id', userId)
    .is('onboarding_completed_at', null);

  if (error) throw error;
  return getUser(userId);
}

/**
 * Record that `refereeId` signed up through `referrerId`'s code.
 *
 * Returns { created: false, reason } instead of throwing for the refusals a
 * caller has to expect: a self-referral, and a referee who has already been
 * attributed to someone (the first referral wins; it is never reassigned).
 */
async function createReferral({ referrerId, refereeId, code }) {
  if (!referrerId || !refereeId) return { created: false, reason: 'invalid' };
  if (referrerId === refereeId) return { created: false, reason: 'self' };

  const row = {
    referrer_id: referrerId,
    referee_id: refereeId,
    code,
    status: 'signed_up'
  };

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    if (memoryDb.referrals.some((r) => r.referee_id === refereeId)) {
      return { created: false, reason: 'duplicate' };
    }
    const referral = { id: uuidv4(), ...row, created_at: new Date().toISOString() };
    memoryDb.referrals.push(referral);

    const referee = memoryDb.usersById.get(refereeId);
    if (referee) replaceMemoryUser({ ...referee, referred_by: referrerId });
    return { created: true, referral };
  }

  const { data, error } = await supabase.from('referrals').insert([row]).select().single();
  if (error) {
    if (error.code === '23505') return { created: false, reason: 'duplicate' };
    throw error;
  }

  // Denormalised onto the user for cheap "who brought this person" reads. The
  // referrals row is the record; a failure here is not worth failing over.
  const { error: userError } = await supabase
    .from('users')
    .update({ referred_by: referrerId })
    .eq('id', refereeId);
  if (userError) console.warn(`[referrals] could not set referred_by: ${userError.message}`);

  return { created: true, referral: data };
}

async function getReferralsByReferrer(referrerId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.referrals.filter((r) => r.referrer_id === referrerId));
  }

  const { data, error } = await supabase
    .from('referrals')
    .select('id, referee_id, status, created_at')
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * How many of these users currently hold an active subscription. Read-only:
 * it is how a referral counts as converted, and it never touches billing.
 */
async function countSubscribedUsers(userIds) {
  if (!userIds.length) return 0;
  const now = new Date().toISOString();

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const wanted = new Set(userIds);
    const subscribed = new Set(
      memoryDb.subscriptions
        .filter((s) => wanted.has(s.user_id) && s.status === 'active' && (!s.ends_at || s.ends_at > now))
        .map((s) => s.user_id)
    );
    return subscribed.size;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id')
    .in('user_id', userIds)
    .eq('status', 'active')
    .or(`ends_at.is.null,ends_at.gt.${now}`);

  if (error) throw error;
  return new Set((data || []).map((row) => row.user_id)).size;
}

/**
 * Record an earned reward, once per referral. `created: false` means it was
 * already recorded — a retried signup handler must not pay out twice.
 */
async function createReferralReward({ userId, referralId, type, amount, reason }) {
  const row = {
    user_id: userId,
    referral_id: referralId,
    type,
    amount,
    reason,
    status: 'earned'
  };

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    if (memoryDb.referralRewards.some((r) => r.referral_id === referralId && r.user_id === userId)) {
      return { created: false };
    }
    const reward = { id: uuidv4(), ...row, created_at: new Date().toISOString() };
    memoryDb.referralRewards.push(reward);
    return { created: true, reward };
  }

  const { data, error } = await supabase.from('referral_rewards').insert([row]).select().single();
  if (error) {
    if (error.code === '23505') return { created: false };
    throw error;
  }
  return { created: true, reward: data };
}

async function getReferralRewards(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.referralRewards.filter((r) => r.user_id === userId));
  }

  const { data, error } = await supabase
    .from('referral_rewards')
    .select('id, type, amount, reason, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Web Push — browser subscriptions and reminder settings (migrations/020).
 *
 * A subscription is one browser on one device; `endpoint` is its identity and
 * is unique, so a browser that switches accounts moves its row to the new
 * user instead of notifying both. The p256dh/auth keys let anyone holding them
 * send to that browser, so on Supabase these tables are reached with the
 * service-role client (RLS on, no policies), like marketing_leads.
 *
 * Reminder settings are per user, not per device: one row holding what the
 * user chose plus `state` (when each reminder last went out), which only the
 * scheduler writes.
 */
async function savePushSubscription(userId, { endpoint, p256dh, auth, userAgent = null }) {
  const now = new Date().toISOString();
  const row = { user_id: userId, endpoint, p256dh, auth, user_agent: userAgent };

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const existing = memoryDb.pushSubscriptions.find((r) => r.endpoint === endpoint);
    if (existing) {
      Object.assign(existing, row, { updated_at: now, failure_count: 0 });
      return existing;
    }
    const created = { id: uuidv4(), ...row, failure_count: 0, created_at: now, updated_at: now };
    memoryDb.pushSubscriptions.push(created);
    return created;
  }

  const { data, error } = await supabaseServiceRole
    .from('push_subscriptions')
    .upsert([{ ...row, failure_count: 0, updated_at: now }], { onConflict: 'endpoint' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getPushSubscriptions(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.pushSubscriptions.filter((r) => r.user_id === userId);
  }

  const { data, error } = await supabaseServiceRole
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

/** Remove one of this user's subscriptions. Another user's endpoint is left alone. */
async function deletePushSubscription(userId, endpoint) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const before = memoryDb.pushSubscriptions.length;
    memoryDb.pushSubscriptions = memoryDb.pushSubscriptions.filter(
      (r) => !(r.user_id === userId && r.endpoint === endpoint)
    );
    return memoryDb.pushSubscriptions.length < before;
  }

  const { data, error } = await supabaseServiceRole
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

/** The push service said this endpoint is gone (404/410): drop it, whoever owns it. */
async function deletePushSubscriptionByEndpoint(endpoint) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const before = memoryDb.pushSubscriptions.length;
    memoryDb.pushSubscriptions = memoryDb.pushSubscriptions.filter((r) => r.endpoint !== endpoint);
    return memoryDb.pushSubscriptions.length < before;
  }

  const { error } = await supabaseServiceRole.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
  return true;
}

/** Record a delivery outcome: success resets the failure count, failure bumps it. */
async function markPushSubscriptionResult(endpoint, ok) {
  const now = new Date().toISOString();

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = memoryDb.pushSubscriptions.find((r) => r.endpoint === endpoint);
    if (!row) return null;
    if (ok) {
      row.failure_count = 0;
      row.last_success_at = now;
    } else {
      row.failure_count = (row.failure_count || 0) + 1;
    }
    return row;
  }

  if (ok) {
    const { error } = await supabaseServiceRole
      .from('push_subscriptions')
      .update({ failure_count: 0, last_success_at: now })
      .eq('endpoint', endpoint);
    if (error) throw error;
    return true;
  }
  const { data: current, error: readError } = await supabaseServiceRole
    .from('push_subscriptions')
    .select('failure_count')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;
  const { error } = await supabaseServiceRole
    .from('push_subscriptions')
    .update({ failure_count: (current.failure_count || 0) + 1 })
    .eq('endpoint', endpoint);
  if (error) throw error;
  return true;
}

async function getPushReminderSettings(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.pushReminderSettings.find((r) => r.user_id === userId) || null;
  }

  const { data, error } = await supabaseServiceRole
    .from('push_reminder_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Save what the user chose. Leaves `state` (the scheduler's bookkeeping) as it was. */
async function savePushReminderSettings(userId, { enabled, tz, lang, settings }) {
  const now = new Date().toISOString();
  const row = { user_id: userId, enabled: Boolean(enabled), tz, lang, settings, updated_at: now };

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const existing = memoryDb.pushReminderSettings.find((r) => r.user_id === userId);
    if (existing) return Object.assign(existing, row);
    const created = { ...row, state: {}, created_at: now };
    memoryDb.pushReminderSettings.push(created);
    return created;
  }

  const { data, error } = await supabaseServiceRole
    .from('push_reminder_settings')
    .upsert([row], { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updatePushReminderState(userId, state) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const existing = memoryDb.pushReminderSettings.find((r) => r.user_id === userId);
    if (!existing) return null;
    existing.state = state;
    return existing;
  }

  const { error } = await supabaseServiceRole
    .from('push_reminder_settings')
    .update({ state })
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

/** Every user with reminders switched on — the scheduler's work list. */
async function listEnabledPushReminderSettings() {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.pushReminderSettings.filter((r) => r.enabled);
  }

  return selectAllPages(() =>
    supabaseServiceRole
      .from('push_reminder_settings')
      .select('*')
      .eq('enabled', true)
      .order('user_id', { ascending: true })
  );
}

/**
 * Meal plans — the week a paying customer is buying.
 *
 * These lived in a module-level array in index.js until now, which meant every
 * restart silently discarded the plan and the grocery list derived from it.
 * The functions below are the whole surface the routes need, so no route has
 * to know which store is underneath.
 */
async function getMealPlans(userId, { start = null, end = null } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.mealPlans.filter(
      (plan) =>
        plan.user_id === userId &&
        (!start || plan.date >= start) &&
        (!end || plan.date <= end)
    );
  }

  let query = supabase.from('meal_plans').select('*').eq('user_id', userId);
  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);

  const { data, error } = await query.order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getMealPlanById(planId, userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.mealPlans.find((plan) => plan.id === planId && plan.user_id === userId) || null;
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Insert plans, skipping any that collide with the one-per-meal-slot rule.
 *
 * The caller wants to know what was actually written, so a collision is
 * reported as a skip rather than raised: generating a week over days that are
 * already planned is ordinary use, not an error. Postgres code 23505 is the
 * unique violation.
 */
async function createMealPlans(userId, entries) {
  const created = [];
  let skipped = 0;

  for (const entry of entries) {
    const row = {
      id: uuidv4(),
      user_id: userId,
      recipe_id: entry.recipe_id,
      date: entry.date,
      meal_type: entry.meal_type,
      completed: false,
      created_at: new Date().toISOString()
    };

    if (USE_MEMORY_DB) {
      maybeLogMemoryMode();
      const clash = memoryDb.mealPlans.some(
        (plan) =>
          plan.user_id === userId && plan.date === row.date && plan.meal_type === row.meal_type
      );
      if (clash) {
        skipped += 1;
        continue;
      }
      memoryDb.mealPlans.push(row);
      created.push(row);
      continue;
    }

    const { data, error } = await supabase.from('meal_plans').insert([row]).select().single();

    if (error) {
      if (error.code === '23505') {
        skipped += 1;
        continue;
      }
      throw error;
    }
    created.push(data);
  }

  return { created, skipped };
}

async function deleteMealPlansInRange(userId, { start, end, mealTypes }) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const before = memoryDb.mealPlans.length;
    memoryDb.mealPlans = memoryDb.mealPlans.filter(
      (plan) =>
        !(
          plan.user_id === userId &&
          plan.date >= start &&
          plan.date <= end &&
          mealTypes.includes(plan.meal_type)
        )
    );
    return before - memoryDb.mealPlans.length;
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .delete()
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .in('meal_type', mealTypes)
    .select();

  if (error) throw error;
  return (data || []).length;
}

/**
 * Update a plan. Only the fields a client is allowed to move are passed in;
 * the route decides which those are, so nothing here can reassign ownership.
 */
async function updateMealPlan(planId, userId, changes) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const index = memoryDb.mealPlans.findIndex(
      (plan) => plan.id === planId && plan.user_id === userId
    );
    if (index === -1) return null;
    memoryDb.mealPlans[index] = { ...memoryDb.mealPlans[index], ...changes };
    return memoryDb.mealPlans[index];
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .update(changes)
    .eq('id', planId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function deleteMealPlan(planId, userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const index = memoryDb.mealPlans.findIndex(
      (plan) => plan.id === planId && plan.user_id === userId
    );
    if (index === -1) return null;
    return memoryDb.mealPlans.splice(index, 1)[0];
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Subscriptions — what someone bought, which is what grants access.
 */
async function getActiveSubscriptions(userId) {
  // status alone was the whole test, so a row with ends_at in the past still
  // read as active — a subscription that ended in March would have kept
  // granting access forever. Reading the date here means access expires the
  // moment anything writes one, with no scheduled job to run or forget.
  const now = new Date().toISOString();

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.subscriptions.filter(
      (row) =>
        row.user_id === userId &&
        row.status === 'active' &&
        (!row.ends_at || row.ends_at > now)
    );
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    // null means open-ended, which is the normal case for a live subscription.
    .or(`ends_at.is.null,ends_at.gt.${now}`);

  if (error) throw error;
  return data || [];
}

async function hasEntitlement(userId, plan) {
  const active = await getActiveSubscriptions(userId);
  return active.some((row) => row.plan === plan);
}

/**
 * Start a subscription, renew one that has ended, or leave a live one alone.
 *
 * A repeated callback must not produce a second active row, so the collision
 * is treated as "already subscribed" rather than as an error. Postgres code
 * 23505 is the unique violation from subscriptions_one_active_per_plan.
 *
 * That index keys on status alone, so a row that has passed its ends_at but is
 * still marked 'active' goes on holding the slot for its plan. It used to be
 * handed straight back as "already subscribed", and once getActiveSubscriptions
 * started reading ends_at that answer became wrong in the worst direction:
 * somebody renewing paid, the callback logged an activation, and they had no
 * access. An ended row is closed and replaced instead.
 */
async function createSubscription(userId, plan) {
  const isLive = (row) => row && (!row.ends_at || row.ends_at > new Date().toISOString());

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const holder = memoryDb.subscriptions.find(
      (row) => row.user_id === userId && row.plan === plan && row.status === 'active'
    );

    if (isLive(holder)) return { subscription: holder, created: false };

    // Closed rather than overwritten: what was sold and when is the record a
    // billing dispute gets settled from.
    if (holder) holder.status = 'expired';

    const row = {
      id: uuidv4(),
      user_id: userId,
      plan,
      status: 'active',
      started_at: new Date().toISOString(),
      ends_at: null,
      created_at: new Date().toISOString()
    };
    memoryDb.subscriptions.push(row);
    return { subscription: row, created: true };
  }

  // Two passes at most: the insert, then — if an ended row was holding the
  // slot — the same insert again once that row has been closed.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert([{ user_id: userId, plan, status: 'active' }])
      .select()
      .single();

    if (!error) return { subscription: data, created: true };
    if (error.code !== '23505') throw error;

    // Read the blocking row directly rather than through
    // getActiveSubscriptions, which now filters out exactly the ended row we
    // are here to deal with.
    const { data: holder, error: readError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('plan', plan)
      .eq('status', 'active')
      .maybeSingle();

    if (readError) throw readError;

    // A live subscription already: the repeated-delivery case the index is for.
    if (isLive(holder)) return { subscription: holder, created: false };

    // Gone between the conflict and the read — try the insert once more.
    if (!holder) continue;

    const { error: closeError } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('id', holder.id)
      .eq('status', 'active');

    if (closeError) throw closeError;
  }

  // Loud rather than silent. The callback records the payment event before it
  // gets here, so a retry from PayPlus is swallowed as a duplicate — a
  // subscription that quietly failed to open would never be opened at all.
  throw new Error(`Could not open a '${plan}' subscription for user ${userId}`);
}

/**
 * Record a payment callback, once.
 *
 * The provider retries, so the page request id is the primary key and the
 * database decides whether this delivery is new. `created: false` means we
 * have seen it before and nothing further should happen — that is the whole
 * idempotency guarantee, and it lives in a constraint rather than in an if.
 */
async function recordPaymentEvent(event) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    if (memoryDb.paymentEvents.some((row) => row.page_request_uid === event.page_request_uid)) {
      return { created: false };
    }
    memoryDb.paymentEvents.push({ ...event, received_at: new Date().toISOString() });
    return { created: true };
  }

  const { error } = await supabase.from('payment_events').insert([event]);

  if (error) {
    if (error.code === '23505') return { created: false };
    throw error;
  }
  return { created: true };
}

/**
 * Marketing leads — people who left an email on the landing page.
 *
 * One row per address. The email arrives already trimmed and lower-cased, and
 * the unique index on it (migrations/013) is what decides whether a submission
 * is new, so two tabs submitting at once still make one row. A repeat keeps the
 * first-touch attribution (source/utm_*) — that is the visit that found us —
 * and only records that the person came back.
 *
 * Leads are personal data about people who are not customers, so on Supabase
 * the table has RLS on with no policies and is reached with the service-role
 * client, like the WHAPI tables.
 */
async function createLead(lead) {
  const now = new Date().toISOString();

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const existing = memoryDb.leads.find((row) => row.email === lead.email);
    if (existing) {
      existing.last_submitted_at = now;
      existing.submissions = (existing.submissions || 1) + 1;
      if (!existing.name && lead.name) existing.name = lead.name;
      return { lead: existing, created: false };
    }
    const row = {
      id: uuidv4(),
      ...lead,
      submissions: 1,
      created_at: now,
      last_submitted_at: now
    };
    memoryDb.leads.push(row);
    return { lead: row, created: true };
  }

  const { data, error } = await supabaseServiceRole
    .from('marketing_leads')
    .insert([{ ...lead, submissions: 1, created_at: now, last_submitted_at: now }])
    .select()
    .single();

  if (!error) return { lead: data, created: true };
  if (error.code !== '23505') throw error;

  // Already on the list. Read, then note the return visit without touching the
  // attribution the first visit recorded.
  const { data: existing, error: readError } = await supabaseServiceRole
    .from('marketing_leads')
    .select('*')
    .eq('email', lead.email)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error('Lead conflicted on email but could not be read back');

  const patch = {
    last_submitted_at: now,
    submissions: (existing.submissions || 1) + 1
  };
  if (!existing.name && lead.name) patch.name = lead.name;

  const { data: updated, error: updateError } = await supabaseServiceRole
    .from('marketing_leads')
    .update(patch)
    .eq('id', existing.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return { lead: updated, created: false };
}

async function listLeads({ limit = 5000 } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.leads).slice(0, limit);
  }

  return selectAllPages(
    () =>
      supabaseServiceRole
        .from('marketing_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }),
    limit
  );
}

/**
 * Lead lookups and changes the lifecycle campaigns need: unsubscribing one,
 * and forgetting one entirely (the landing page's consent text promises
 * removal on request).
 */
async function getLeadById(leadId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.leads.find((row) => row.id === leadId) || null;
  }
  const { data, error } = await supabaseServiceRole
    .from('marketing_leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getLeadByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.leads.find((row) => row.email === normalized) || null;
  }
  const { data, error } = await supabaseServiceRole
    .from('marketing_leads')
    .select('*')
    .eq('email', normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateLead(leadId, patch) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = memoryDb.leads.find((lead) => lead.id === leadId);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }
  const { data, error } = await supabaseServiceRole
    .from('marketing_leads')
    .update(patch)
    .eq('id', leadId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Delete a lead and its send log. Returns true when a row was removed. */
async function deleteLead(leadId) {
  await deleteLifecycleSendsFor('lead', leadId);

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const before = memoryDb.leads.length;
    memoryDb.leads = memoryDb.leads.filter((row) => row.id !== leadId);
    return memoryDb.leads.length < before;
  }
  const { data, error } = await supabaseServiceRole
    .from('marketing_leads')
    .delete()
    .eq('id', leadId)
    .select('id');
  if (error) throw error;
  return Boolean(data && data.length);
}

/**
 * Notification preferences (migrations/018) — one row per user. A user with
 * no row gets the defaults: service emails on, marketing and WhatsApp off.
 */
const NOTIFICATION_DEFAULTS = Object.freeze({
  email_lifecycle: true,
  marketing_email: false,
  marketing_consent_at: null,
  whatsapp: false,
  whatsapp_consent_at: null,
  lang: null,
  timezone: null,
  unsubscribed_at: null
});

const NOTIFICATION_FIELDS = Object.keys(NOTIFICATION_DEFAULTS);

function withNotificationDefaults(userId, row) {
  return { user_id: userId, ...NOTIFICATION_DEFAULTS, ...(row || {}) };
}

async function getNotificationPrefs(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return withNotificationDefaults(userId, memoryDb.notificationPrefs.get(userId));
  }
  const { data, error } = await supabaseServiceRole
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return withNotificationDefaults(userId, data);
}

/** All stored rows, keyed by user id (the runner reads them in one go). */
async function listNotificationPrefs() {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return new Map(memoryDb.notificationPrefs);
  }
  // Paged past the row cap: a user missing from this map is treated as having
  // the defaults (service email on), which would undo their unsubscribe.
  const data = await selectAllPages(() =>
    supabaseServiceRole
      .from('notification_preferences')
      .select('*')
      .order('user_id', { ascending: true })
  );
  return new Map(data.map((row) => [row.user_id, row]));
}

async function upsertNotificationPrefs(userId, patch) {
  const clean = Object.fromEntries(
    Object.entries(patch || {}).filter(([key]) => NOTIFICATION_FIELDS.includes(key))
  );
  const now = new Date().toISOString();

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const current = memoryDb.notificationPrefs.get(userId) || {};
    const next = { ...current, ...clean, user_id: userId, updated_at: now };
    memoryDb.notificationPrefs.set(userId, next);
    return withNotificationDefaults(userId, next);
  }

  const { data, error } = await supabaseServiceRole
    .from('notification_preferences')
    .upsert([{ ...clean, user_id: userId, updated_at: now }], { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return withNotificationDefaults(userId, data);
}

/**
 * Lifecycle send log (migrations/018).
 *
 * `claimLifecycleSend` inserts the row BEFORE the message goes out. The unique
 * index on (recipient_type, recipient_id, campaign, period_key) means only one
 * caller can claim a given message — a second cron run, a restarted process,
 * or a staff "run now" racing the schedule all get `claimed: false` and do not
 * send.
 */
async function claimLifecycleSend(row) {
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    recipient_type: row.recipient_type,
    recipient_id: row.recipient_id,
    campaign: row.campaign,
    step: row.step,
    period_key: row.period_key,
    channel: row.channel,
    status: 'pending',
    error: null,
    created_at: now,
    sent_at: null,
    opened_at: null,
    converted_at: null
  };

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const taken = memoryDb.lifecycleSends.some(
      (s) =>
        s.recipient_type === record.recipient_type &&
        s.recipient_id === record.recipient_id &&
        s.campaign === record.campaign &&
        s.period_key === record.period_key
    );
    if (taken) return { claimed: false };
    memoryDb.lifecycleSends.push(record);
    return { claimed: true, send: { ...record } };
  }

  const { data, error } = await supabaseServiceRole
    .from('lifecycle_sends')
    .insert([record])
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return { claimed: false };
    throw error;
  }
  return { claimed: true, send: data };
}

async function updateLifecycleSend(sendId, patch) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = memoryDb.lifecycleSends.find((s) => s.id === sendId);
    if (!row) return null;
    Object.assign(row, patch);
    return { ...row };
  }
  const { data, error } = await supabaseServiceRole
    .from('lifecycle_sends')
    .update(patch)
    .eq('id', sendId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listLifecycleSends({ recipientType = null, recipientId = null, campaign = null, limit = 50000 } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.lifecycleSends
      .filter((s) => !recipientType || s.recipient_type === recipientType)
      .filter((s) => !recipientId || s.recipient_id === recipientId)
      .filter((s) => !campaign || s.campaign === campaign)
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }
  // Paged past the row cap. Oldest-first plus a single capped request meant
  // the NEWEST sends were the ones dropped — exactly the rows the daily cap
  // and the "step already sent" checks need.
  return selectAllPages(() => {
    let query = supabaseServiceRole.from('lifecycle_sends').select('*');
    if (recipientType) query = query.eq('recipient_type', recipientType);
    if (recipientId) query = query.eq('recipient_id', recipientId);
    if (campaign) query = query.eq('campaign', campaign);
    return query.order('created_at', { ascending: true }).order('id', { ascending: true });
  }, limit);
}

/** Stamp converted_at on a recipient's sent messages of one campaign that lack it. */
async function markLifecycleConverted(recipientType, recipientId, campaign, at = new Date().toISOString()) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    let count = 0;
    for (const s of memoryDb.lifecycleSends) {
      if (
        s.recipient_type === recipientType &&
        s.recipient_id === recipientId &&
        s.campaign === campaign &&
        s.status === 'sent' &&
        !s.converted_at
      ) {
        s.converted_at = at;
        count++;
      }
    }
    return count;
  }
  const { data, error } = await supabaseServiceRole
    .from('lifecycle_sends')
    .update({ converted_at: at })
    .eq('recipient_type', recipientType)
    .eq('recipient_id', recipientId)
    .eq('campaign', campaign)
    .eq('status', 'sent')
    .is('converted_at', null)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

async function deleteLifecycleSendsFor(recipientType, recipientId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    memoryDb.lifecycleSends = memoryDb.lifecycleSends.filter(
      (s) => !(s.recipient_type === recipientType && s.recipient_id === recipientId)
    );
    return true;
  }
  const { error } = await supabaseServiceRole
    .from('lifecycle_sends')
    .delete()
    .eq('recipient_type', recipientType)
    .eq('recipient_id', recipientId);
  if (error) throw error;
  return true;
}

/**
 * Foods — nutrition values per 100 g, each one carrying its source.
 *
 * Nothing writes here except scripts/ingest-foods.js, and that script only
 * writes what it read from a cited database. There is no code path in this
 * project that puts a calorie value into this table by hand.
 */
async function upsertFoods(rows) {
  if (!rows.length) return 0;

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    for (const row of rows) {
      const i = memoryDb.foods.findIndex(
        (f) => f.source === row.source && f.source_ref === row.source_ref && f.state === row.state
      );
      const record = { id: i === -1 ? uuidv4() : memoryDb.foods[i].id, ...row, retrieved_at: null };
      if (i === -1) memoryDb.foods.push(record);
      else memoryDb.foods[i] = record;
    }
    return rows.length;
  }

  // Re-running the ingest refreshes values rather than duplicating them; the
  // unique key is (source, source_ref, state).
  const { data, error } = await supabase
    .from('foods')
    .upsert(rows, { onConflict: 'source,source_ref,state' })
    .select('id');

  if (error) throw error;
  return (data || []).length;
}

/**
 * Look a food up by what someone typed. Hebrew name first, then aliases.
 *
 * Returns matches with their source attached, always — a value a consultant
 * cannot attribute is a value she cannot use in front of a customer.
 */
async function searchFoods(term, limit = 20) {
  const needle = String(term || '').trim();
  if (!needle) return [];

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    seedMemoryFoods();
    return rankFoodMatches(memoryDb.foods.map(withCatalogAliases), needle, limit);
  }

  // PostgREST's or() filter is a comma/paren-delimited string: those
  // characters (and the like wildcards) in what someone typed would change
  // the filter, not the search, so they are dropped. An exact synonym
  // ("עגבניות" for "עגבנייה") is found through aliases_he.
  const safe = needle.replace(/[,()%*\\"]/g, ' ').trim();
  if (!safe) return [];
  const alias = JSON.stringify([safe]);
  const filters = [`name_he.ilike.*${safe}*`, `name_en.ilike.*${safe}*`, `aliases_he.cs.${alias}`];
  const canonical = namesForSynonym(safe).map((n) => `"${n.replace(/"/g, '')}"`);
  if (canonical.length) filters.push(`name_he.in.(${canonical.join(',')})`);
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .or(filters.join(','))
    .limit(Math.max(limit * 3, 60));

  if (error) throw error;
  return rankFoodMatches((data || []).map(withCatalogAliases), safe, limit);
}

/**
 * In memory mode the foods table starts empty. Dev and the e2e suite get the
 * sourced USDA rows from data/foods-usda.json (the same file the ingest's
 * --from-file loads into Supabase), once, and only when nothing has been
 * loaded already — a test that seeds its own rows keeps exactly those.
 */
let memoryFoodsSeeded = false;
function seedMemoryFoods() {
  if (memoryFoodsSeeded) return;
  memoryFoodsSeeded = true;
  if (memoryDb.foods.length) return;
  try {
    const rows = require('../data/foods-usda.json').foods || [];
    for (const row of rows) memoryDb.foods.push({ id: uuidv4(), ...withCatalogAliases(row), retrieved_at: null });
  } catch (error) {
    logger.warn('foods: could not seed the in-memory catalog', { err: error });
  }
}

async function getFoodById(foodId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    seedMemoryFoods();
    return memoryDb.foods.find((f) => f.id === foodId) || null;
  }

  const { data, error } = await supabase.from('foods').select('*').eq('id', foodId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function countFoods() {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    seedMemoryFoods();
    return memoryDb.foods.length;
  }
  const { count, error } = await supabase.from('foods').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

/**
 * Phone identity — what links a WhatsApp sender to a paying account.
 *
 * Both sides normalise through utils/phone before touching the database, so
 * "050-123-4567" and "972501234567@s.whatsapp.net" reach the same row. A
 * number that cannot be normalised is refused rather than stored raw: a
 * half-formed value here would match nobody, or worse, the wrong person.
 */
async function setUserPhone(userId, rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    // One account per number, enforced here the way the partial unique index
    // enforces it in Postgres.
    for (const [otherId, other] of memoryDb.usersById) {
      if (otherId !== userId && other.phone === phone) {
        const err = new Error('Phone already belongs to another account');
        err.code = 'PHONE_TAKEN';
        throw err;
      }
    }
    const updated = { ...user, phone };
    memoryDb.usersById.set(userId, updated);
    memoryDb.usersByEmail.set(String(updated.email || '').toLowerCase(), updated);
    return updated;
  }

  const { data, error } = await supabase
    .from('users')
    .update({ phone })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const err = new Error('Phone already belongs to another account');
      err.code = 'PHONE_TAKEN';
      throw err;
    }
    throw error;
  }
  return data;
}

async function getUserByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    for (const user of memoryDb.usersById.values()) {
      if (user.phone === phone) return user;
    }
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * What a WhatsApp sender is entitled to, answered in one call.
 *
 * Returns { user, plans, has(feature) }. `user` is null for a number nobody
 * has claimed, which is an ordinary state: people message before they buy.
 * Throws rather than returning "no access" when the lookup itself fails —
 * the caller decides what to do, and a database outage must not read as a
 * paying customer having lapsed.
 */
async function getWhatsappAccess(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { user: null, plans: [], has: () => false };

  const user = await getUserByPhone(phone);
  if (!user) return { user: null, plans: [], has: () => false };

  const subscriptions = await getActiveSubscriptions(user.id);
  const plans = subscriptions.map((row) => row.plan);
  return {
    user,
    plans,
    has: (plan) => plans.includes(plan)
  };
}

/**
 * Update user preferences JSON
 */
// Preferences are stored on the user record; this is the read side of
// updateUserPreferences, which several routes assumed already existed.
async function getUserPreferences(userId) {
  const user = await getUser(userId);
  return user ? (user.preferences || {}) : null;
}

async function updateUserPreferences(userId, preferences) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const user = memoryDb.usersById.get(userId);
    if (!user) return null;
    const updated = { ...user, preferences };
    memoryDb.usersById.set(userId, updated);
    memoryDb.usersByEmail.set(String(updated.email || '').toLowerCase(), updated);
    return updated;
  }

  const { data, error } = await supabase
    .from('users')
    .update({ preferences })
    .eq('id', userId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * SURVEYS
 */
async function createSurvey(userId, surveyData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...surveyData,
      created_at: new Date().toISOString()
    };
    memoryDb.surveys.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('surveys')
    .insert([
      {
        user_id: userId,
        ...surveyData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getSurveys(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.surveys.filter(s => s.user_id === userId));
  }
  const { data, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// getSurveys returns newest-first, so the latest survey is simply the first.
async function getLatestSurvey(userId) {
  const surveys = await getSurveys(userId);
  return surveys[0] || null;
}

async function getSurveyById(surveyId, userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.surveys.find(s => s.id === surveyId && s.user_id === userId) || null;
  }
  const { data, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('id', surveyId)
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * WEIGHT GOALS
 */
async function createWeightGoal(userId, goalData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...goalData,
      created_at: new Date().toISOString()
    };
    memoryDb.weightGoals.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('weight_goals')
    .insert([
      {
        user_id: userId,
        ...goalData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getWeightGoals(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.weightGoals.filter(g => g.user_id === userId));
  }
  const { data, error } = await supabase
    .from('weight_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async function getWeightGoalById(goalId, userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.weightGoals.find(g => g.id === goalId && g.user_id === userId) || null;
  }
  const { data, error } = await supabase
    .from('weight_goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * WEIGHT LOGS
 */
async function createWeightLog(userId, logData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...logData,
      created_at: new Date().toISOString()
    };
    memoryDb.weightLogs.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('weight_logs')
    .insert([
      {
        user_id: userId,
        ...logData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getWeightLogs(userId, goalId = null) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const rows = memoryDb.weightLogs.filter(r => r.user_id === userId && (!goalId || r.goal_id === goalId));
    return sortByCreatedAtDesc(rows);
  }
  // Paged past the row cap: a heavy logger's older rows would otherwise vanish
  // from streaks, achievements and the weight chart.
  return selectAllPages(() => {
    let query = supabase.from('weight_logs').select('*').eq('user_id', userId);
    if (goalId) query = query.eq('goal_id', goalId);
    return query.order('created_at', { ascending: false }).order('id', { ascending: true });
  }, Infinity);
}

/**
 * HYDRATION LOGS
 */
async function createHydrationLog(userId, logData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...logData,
      created_at: new Date().toISOString()
    };
    memoryDb.hydrationLogs.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('hydration_logs')
    .insert([
      {
        user_id: userId,
        ...logData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getHydrationLogs(userId, date = null) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const rows = memoryDb.hydrationLogs.filter(r => r.user_id === userId && (!date || r.date === date));
    return sortByCreatedAtDesc(rows);
  }
  // Paged past the row cap (a few glasses a day passes 1000 rows within a year).
  return selectAllPages(() => {
    let query = supabase.from('hydration_logs').select('*').eq('user_id', userId);
    if (date) query = query.eq('date', date);
    return query.order('created_at', { ascending: false }).order('id', { ascending: true });
  }, Infinity);
}

/**
 * SLEEP LOGS
 */
async function createSleepLog(userId, logData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...logData,
      created_at: new Date().toISOString()
    };
    memoryDb.sleepLogs.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('sleep_logs')
    .insert([
      {
        user_id: userId,
        ...logData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getSleepLogs(userId, date = null) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const rows = memoryDb.sleepLogs.filter(r => r.user_id === userId && (!date || r.date === date));
    return sortByCreatedAtDesc(rows);
  }
  // Paged past the row cap.
  return selectAllPages(() => {
    let query = supabase.from('sleep_logs').select('*').eq('user_id', userId);
    if (date) query = query.eq('date', date);
    return query.order('created_at', { ascending: false }).order('id', { ascending: true });
  }, Infinity);
}

/**
 * FASTING WINDOWS
 */
async function createFastingWindow(userId, windowData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...windowData,
      created_at: new Date().toISOString()
    };
    memoryDb.fastingWindows.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('fasting_windows')
    .insert([
      {
        user_id: userId,
        ...windowData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getFastingWindows(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.fastingWindows.filter(r => r.user_id === userId));
  }
  const { data, error } = await supabase
    .from('fasting_windows')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * MEAL SWAPS
 */
async function createMealSwap(userId, swapData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...swapData,
      created_at: new Date().toISOString()
    };
    memoryDb.mealSwaps.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('meal_swaps')
    .insert([
      {
        user_id: userId,
        ...swapData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getMealSwaps(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.mealSwaps.filter(r => r.user_id === userId));
  }
  const { data, error } = await supabase
    .from('meal_swaps')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * READINESS SCORES
 */
async function createReadinessScore(userId, scoreData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...scoreData,
      created_at: new Date().toISOString()
    };
    memoryDb.readinessScores.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('readiness_scores')
    .insert([
      {
        user_id: userId,
        ...scoreData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getReadinessScores(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(memoryDb.readinessScores.filter(r => r.user_id === userId));
  }
  const { data, error } = await supabase
    .from('readiness_scores')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * OFFLINE LOGS
 */
async function createOfflineLog(userId, logData) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      synced: false,
      ...logData,
      created_at: new Date().toISOString()
    };
    memoryDb.offlineLogs.push(row);
    return row;
  }
  const { data, error } = await supabase
    .from('offline_logs')
    .insert([
      {
        user_id: userId,
        ...logData,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getOfflineLogs(userId, synced = false) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const rows = memoryDb.offlineLogs.filter(r => r.user_id === userId && (synced === null ? true : r.synced === Boolean(synced)));
    return sortByCreatedAtDesc(rows);
  }
  let query = supabase
    .from('offline_logs')
    .select('*')
    .eq('user_id', userId);
  
  if (synced !== null) {
    query = query.eq('synced', synced);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async function markOfflineLogSynced(logId, userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const idx = memoryDb.offlineLogs.findIndex(r => r.id === logId && r.user_id === userId);
    if (idx === -1) return null;
    memoryDb.offlineLogs[idx] = { ...memoryDb.offlineLogs[idx], synced: true, synced_at: new Date().toISOString() };
    return memoryDb.offlineLogs[idx];
  }
  const { data, error } = await supabase
    .from('offline_logs')
    .update({ synced: true })
    .eq('id', logId)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * FOOD LOGS
 */
async function createFoodLog(userId, foodLog) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...foodLog,
      created_at: new Date().toISOString()
    };
    memoryDb.foodLogs.push(row);
    return normalizeFoodLogRow(row);
  }

  const [data] = await insertWithOptionalColumns('food_logs', [{ user_id: userId, ...foodLog }]);
  return normalizeFoodLogRow(data);
}

/**
 * Several logs in one insert (copy a day, log a saved meal): one round trip,
 * and either every row lands or none does.
 */
async function createFoodLogs(userId, foodLogs) {
  if (!foodLogs.length) return [];
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const out = [];
    for (const f of foodLogs) out.push(await createFoodLog(userId, f));
    return out;
  }
  const data = await insertWithOptionalColumns(
    'food_logs',
    foodLogs.map((f) => ({ user_id: userId, ...f }))
  );
  return data.map(normalizeFoodLogRow);
}

/** Deletes only rows of `userId` among `ids`; returns the rows deleted. */
async function deleteFoodLogs(userId, ids) {
  const wanted = Array.from(new Set((ids || []).filter(Boolean).map(String)));
  if (!wanted.length) return [];
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const set = new Set(wanted);
    const removed = memoryDb.foodLogs.filter((r) => r.user_id === userId && set.has(r.id));
    memoryDb.foodLogs = memoryDb.foodLogs.filter((r) => !(r.user_id === userId && set.has(r.id)));
    return removed.map(normalizeFoodLogRow);
  }
  const { data, error } = await supabase
    .from('food_logs')
    .delete()
    .eq('user_id', userId)
    .in('id', wanted)
    .select('*');
  if (error) throw error;
  return (data || []).map(normalizeFoodLogRow);
}

/**
 * FOOD LOG TEMPLATES
 */
async function createFoodLogTemplate(userId, template) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = {
      id: uuidv4(),
      user_id: userId,
      ...template,
      created_at: new Date().toISOString()
    };
    memoryDb.foodLogTemplates.push(row);
    return normalizeFoodLogTemplateRow(row);
  }

  // A saved meal cannot be stored without migration 023 (kind/items), so only
  // a single-food favourite falls back to the old columns.
  if (template.kind === 'meal' || template.items) {
    const { data, error } = await supabase
      .from('food_log_templates')
      .insert([{ user_id: userId, ...template }])
      .select('*')
      .single();
    if (error) throw error;
    return normalizeFoodLogTemplateRow(data);
  }
  const { kind, ...rest } = template;
  let data;
  try {
    [data] = await insertWithOptionalColumns('food_log_templates', [{ user_id: userId, kind: kind || 'food', ...rest }]);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    // Pre-023 database: no `kind` column either.
    [data] = await insertWithOptionalColumns('food_log_templates', [{ user_id: userId, ...rest }]);
  }
  return normalizeFoodLogTemplateRow(data);
}

async function getFoodLogTemplateById(userId, templateId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return normalizeFoodLogTemplateRow(
      memoryDb.foodLogTemplates.find((r) => r.id === templateId && r.user_id === userId) || null
    );
  }
  const { data, error } = await supabase
    .from('food_log_templates')
    .select('*')
    .eq('id', templateId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeFoodLogTemplateRow(data || null);
}

async function updateFoodLogTemplate(userId, templateId, patch) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const idx = memoryDb.foodLogTemplates.findIndex((r) => r.id === templateId && r.user_id === userId);
    if (idx === -1) return null;
    const existing = memoryDb.foodLogTemplates[idx];
    const updated = { ...existing, ...patch, id: existing.id, user_id: existing.user_id, created_at: existing.created_at };
    memoryDb.foodLogTemplates[idx] = updated;
    return normalizeFoodLogTemplateRow(updated);
  }
  const { data, error } = await supabase
    .from('food_log_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return normalizeFoodLogTemplateRow(data || null);
}

async function getFoodLogTemplates(userId, { limit = null, offset = null } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const filtered = sortByCreatedAtDesc(memoryDb.foodLogTemplates.filter(r => r.user_id === userId));

    const offsetNum = offset == null ? 0 : Number(offset);
    const limitNum = limit == null ? null : Number(limit);
    let sliced;
    if (!Number.isFinite(offsetNum) || offsetNum < 0) {
      sliced = filtered;
    } else if (limitNum == null) {
      sliced = filtered.slice(offsetNum);
    } else if (!Number.isFinite(limitNum) || limitNum <= 0) {
      sliced = filtered.slice(offsetNum);
    } else {
      sliced = filtered.slice(offsetNum, offsetNum + limitNum);
    }

    return sliced.map(normalizeFoodLogTemplateRow);
  }

  let query = supabase
    .from('food_log_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (limit != null) {
    const offsetNum = offset == null ? 0 : Number(offset);
    const limitNum = Number(limit);
    if (Number.isFinite(offsetNum) && Number.isFinite(limitNum) && limitNum > 0 && offsetNum >= 0) {
      query = query.range(offsetNum, offsetNum + limitNum - 1);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeFoodLogTemplateRow);
}

async function deleteFoodLogTemplate(userId, templateId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const idx = memoryDb.foodLogTemplates.findIndex(r => r.id === templateId && r.user_id === userId);
    if (idx === -1) return null;
    const removed = memoryDb.foodLogTemplates[idx];
    memoryDb.foodLogTemplates.splice(idx, 1);
    return normalizeFoodLogTemplateRow(removed);
  }

  const { data, error } = await supabase
    .from('food_log_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return normalizeFoodLogTemplateRow(data || null);
}

async function getFoodLogs(userId, { start = null, end = null, date = null, limit = null, offset = null } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();

    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    const dateStr = date ? String(date) : null;

    const filtered = sortByCreatedAtDesc(
      memoryDb.foodLogs.filter(r => {
        if (r.user_id !== userId) return false;
        if (dateStr && r.date !== dateStr) return false;
        if (!startDate && !endDate) return true;
        const d = new Date(r.date);
        if (Number.isNaN(d.getTime())) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      })
    );

    const offsetNum = offset == null ? 0 : Number(offset);
    const limitNum = limit == null ? null : Number(limit);
    let sliced;
    if (!Number.isFinite(offsetNum) || offsetNum < 0) {
      sliced = filtered;
    } else if (limitNum == null) {
      sliced = filtered.slice(offsetNum);
    } else if (!Number.isFinite(limitNum) || limitNum <= 0) {
      sliced = filtered.slice(offsetNum);
    } else {
      sliced = filtered.slice(offsetNum, offsetNum + limitNum);
    }

    return sliced.map(normalizeFoodLogRow);
  }

  const build = () => {
    let query = supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId);

    if (date) {
      query = query.eq('date', date);
    }
    if (start) {
      query = query.gte('date', start);
    }
    if (end) {
      query = query.lte('date', end);
    }
    return query.order('created_at', { ascending: false }).order('id', { ascending: true });
  };

  if (limit != null) {
    const offsetNum = offset == null ? 0 : Number(offset);
    const limitNum = Number(limit);
    if (Number.isFinite(offsetNum) && Number.isFinite(limitNum) && limitNum > 0 && offsetNum >= 0) {
      // An explicit page (the food-log list): one request, as asked.
      const { data, error } = await build().range(offsetNum, offsetNum + limitNum - 1);
      if (error) throw error;
      return (data || []).map(normalizeFoodLogRow);
    }
  }

  // Everything in range, paged past the row cap: streaks, the Health Score
  // and the weekly summary need every row, not the newest 1000.
  const data = await selectAllPages(build, Infinity);
  return data.map(normalizeFoodLogRow);
}

async function getFoodDays(userId, { start, end }) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();

    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;

    const daySet = new Set();
    for (const r of memoryDb.foodLogs) {
      if (!r || r.user_id !== userId) continue;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;
      if (startDate && d < startDate) continue;
      if (endDate && d > endDate) continue;
      if (r.date) daySet.add(r.date);
    }

    return Array.from(daySet).sort();
  }

  let query = supabase
    .from('food_logs')
    .select('date')
    .eq('user_id', userId);

  if (start) {
    query = query.gte('date', start);
  }
  if (end) {
    query = query.lte('date', end);
  }

  const { data, error } = await query.order('date', { ascending: true });
  if (error) throw error;

  const seen = new Set();
  const days = [];
  for (const row of data || []) {
    const dateStr = row?.date;
    if (!dateStr || seen.has(dateStr)) continue;
    seen.add(dateStr);
    days.push(dateStr);
  }
  return days;
}

async function getFoodLogById(userId, logId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return normalizeFoodLogRow(memoryDb.foodLogs.find(r => r.id === logId && r.user_id === userId) || null);
  }

  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('id', logId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeFoodLogRow(data || null);
}

async function deleteFoodLog(userId, logId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const idx = memoryDb.foodLogs.findIndex(r => r.id === logId && r.user_id === userId);
    if (idx === -1) return null;
    const removed = memoryDb.foodLogs[idx];
    memoryDb.foodLogs.splice(idx, 1);
    return normalizeFoodLogRow(removed);
  }

  const { data, error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return normalizeFoodLogRow(data || null);
}

async function updateFoodLog(userId, logId, patch) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const idx = memoryDb.foodLogs.findIndex(r => r.id === logId && r.user_id === userId);
    if (idx === -1) return null;

    const existing = memoryDb.foodLogs[idx];
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      user_id: existing.user_id,
      created_at: existing.created_at
    };

    memoryDb.foodLogs[idx] = updated;
    return normalizeFoodLogRow(updated);
  }

  const patchWithUpdatedAt = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('food_logs')
    .update(patchWithUpdatedAt)
    .eq('id', logId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return normalizeFoodLogRow(data || null);
}


/**
 * WHATSAPP
 */

// Upsert on the WHAPI message id: the same webhook can be delivered twice, and
// a retry must not create a second row.
async function saveWhatsappMessage(msg) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const i = memoryDb.whatsappMessages.findIndex(r => r.id === msg.id);
    const row = { ...msg, received_at: new Date().toISOString() };
    if (i >= 0) memoryDb.whatsappMessages[i] = row;
    else memoryDb.whatsappMessages.push(row);
    return row;
  }

  const { data, error } = await supabase
    .from('whatsapp_messages')
    .upsert([{ ...msg, received_at: new Date().toISOString() }], { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * WHAPI BOT CONVERSATIONS (Adi + Yoni) -- see migrations/001, 003 and 008.
 *
 * migrations/003 renames the stored active_bot value from 'nuri' to 'adi'
 * and updates the check constraint to match. Everything above this file
 * (routes/whapi.js, whapi-brain.js) only ever deals in 'adi'/'yoni' -- but
 * this file can't assume migrations/003 has actually been run against a
 * given database yet, so it normalizes at the boundary instead of
 * requiring the two to be deployed in lockstep:
 *  - read: a legacy 'nuri' row is returned as 'adi'.
 *  - write: if the check constraint still only allows 'nuri' (Postgres
 *    23514, check_violation), retry once with the legacy value instead of
 *    failing the whole request, then return the write normalized to 'adi'
 *    regardless of which value actually landed in the row.
 * Once migrations/003 has run, every write succeeds on the first try and
 * this fallback simply never triggers again -- nothing to clean up later.
 */
// migrations/008 renames the chef persona to 'yoni' the same way 003 renamed
// 'nuri' to 'adi', and is handled by the same boundary mapping: code above
// this file only ever says 'adi'/'yoni', a database that has not run 008 yet
// still says 'chef', and neither has to wait for the other to deploy.
const LEGACY_ACTIVE_BOT = { adi: 'nuri', yoni: 'chef' };
const CANONICAL_ACTIVE_BOT = { nuri: 'adi', chef: 'yoni' };
const CHECK_VIOLATION = '23514';

function normalizeActiveBot(row) {
  if (row && CANONICAL_ACTIVE_BOT[row.active_bot]) {
    return { ...row, active_bot: CANONICAL_ACTIVE_BOT[row.active_bot] };
  }
  return row;
}

async function getWhapiConversation(phone) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return normalizeActiveBot(memoryDb.whapiConversations.get(phone) || null);
  }
  const { data, error } = await supabaseServiceRole
    .from('whapi_conversations')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return normalizeActiveBot(data);
}

async function upsertWhapiConversation(phone, activeBot) {
  const row = { phone, active_bot: activeBot, updated_at: new Date().toISOString() };
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    memoryDb.whapiConversations.set(phone, row);
    return row;
  }
  const { data, error } = await supabaseServiceRole
    .from('whapi_conversations')
    .upsert(row, { onConflict: 'phone' })
    .select()
    .single();

  if (!error) return normalizeActiveBot(data);

  const legacyValue = LEGACY_ACTIVE_BOT[activeBot];
  if (error.code !== CHECK_VIOLATION || !legacyValue) throw error;

  const { data: fallbackData, error: fallbackError } = await supabaseServiceRole
    .from('whapi_conversations')
    .upsert({ ...row, active_bot: legacyValue }, { onConflict: 'phone' })
    .select()
    .single();

  if (fallbackError) throw fallbackError;
  return normalizeActiveBot(fallbackData);
}

// Only what a person answering a message needs. `raw` holds the entire WHAPI
// payload — profile name, media links, metadata nobody reviewing a message has
// to see — and select('*') handed all of it out. It also means a column added
// later is not exposed by an endpoint written before it existed.
//
// One list, used by both branches. Dropping `raw` in the memory branch and
// naming the columns in the Supabase one looked equivalent and was not: a
// column added later would have been withheld in production and handed out in
// dev, which is the direction that hides a leak until it ships.
const WHATSAPP_MESSAGE_FIELDS = [
  'id', 'chat_id', 'from_number', 'from_name', 'type', 'body', 'sent_at', 'status', 'received_at'
];

const WHATSAPP_MESSAGE_SELECT = WHATSAPP_MESSAGE_FIELDS.join(', ');

const projectWhatsappMessage = (row) =>
  Object.fromEntries(WHATSAPP_MESSAGE_FIELDS.map((field) => [field, row[field] ?? null]));

// A status is a fixed set, and it came straight from the query string. An
// unknown value is refused rather than passed through to the database.
const WHATSAPP_STATUSES = ['pending', 'drafted', 'answered', 'escalated'];

async function getWhatsappMessages({ status = null, limit = 50 } = {}) {
  if (status && !WHATSAPP_STATUSES.includes(status)) {
    const err = new Error(`Unknown status: ${status}`);
    err.code = 'BAD_STATUS';
    throw err;
  }

  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    // By received_at, which is the field these rows actually carry —
    // sortByCreatedAtDesc read a created_at that saveWhatsappMessage never
    // writes, so every comparison was NaN and the order was whatever the array
    // happened to be in. Harmless while everything was returned; once `limit`
    // started being enforced it meant an arbitrary subset rather than the
    // newest messages, and the Supabase branch already ordered this way.
    return memoryDb.whatsappMessages
      .filter((r) => !status || r.status === status)
      .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
      .slice(0, capped)
      .map(projectWhatsappMessage);
  }

  let q = supabase
    .from('whatsapp_messages')
    .select(WHATSAPP_MESSAGE_SELECT)
    .order('received_at', { ascending: false })
    .limit(capped);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param {string|null} promptVersion which prompt produced this, e.g.
 *   "adi:dc4acc971f59" — see migrations/011. Null for the customer's own
 *   messages and for anything the system wrote without the model.
 */
async function logWhapiMessage(phone, role, content, promptVersion = null) {
  const row = {
    phone,
    role,
    content,
    prompt_version: promptVersion,
    created_at: new Date().toISOString()
  };

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    memoryDb.whapiMessages.push(row);
    return row;
  }

  const { data, error } = await supabaseServiceRole
    .from('whapi_messages')
    .insert([row])
    .select()
    .single();

  if (error) {
    // A database that has not run migrations/011 yet has no such column
    // (Postgres 42703, undefined_column). Losing the provenance stamp is bad;
    // losing the message itself is worse, so retry without it and say so.
    if (error.code === '42703' && promptVersion) {
      console.warn('[db] whapi_messages has no prompt_version column yet — run migrations/011.');
      const { prompt_version, ...withoutVersion } = row;
      const retry = await supabaseServiceRole
        .from('whapi_messages')
        .insert([withoutVersion])
        .select()
        .single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    throw error;
  }
  return data;
}

/**
 * The full record of a conversation, for reading back rather than for
 * replying.
 *
 * Deliberately separate from getRecentWhapiMessages: that one feeds the
 * model, and the model's context should hold what was said and nothing else.
 * This one is what a person opens when a customer disputes what the bot told
 * them, so it keeps the timestamps and the prompt version that produced each
 * reply.
 *
 * 🩺 These rows can contain health information someone volunteered. Reading
 * them is a considered act, not a convenience.
 */
async function getWhapiTranscript(phone, limit = 50) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.whapiMessages.filter((m) => m.phone === phone).slice(-limit);
  }

  const { data, error } = await supabaseServiceRole
    .from('whapi_messages')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse();
}

async function getRecentWhapiMessages(phone, limit = 20) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.whapiMessages
      .filter(m => m.phone === phone)
      .slice(-limit)
      .map(({ role, content }) => ({ role, content }));
  }
  const { data, error } = await supabaseServiceRole
    .from('whapi_messages')
    .select('role, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse().map(({ role, content }) => ({ role, content }));
}

/**
 * Marketing analytics — bulk reads for the staff dashboard (routes/analytics.js).
 *
 * Every function here takes a whole set (a date range, or a list of ids) and
 * answers it in a bounded number of queries: ids go to Postgres in chunks of
 * ANALYTICS_ID_CHUNK through `.in()`, and results are paged ANALYTICS_PAGE
 * rows at a time. Nothing loops per user, so a 90-day range costs the same
 * handful of round trips whether it holds ten signups or ten thousand.
 *
 * The aggregation itself lives in utils/analytics.js and never sees the
 * database. These functions return raw rows; masking happens there.
 */
const ANALYTICS_ID_CHUNK = 200;
const ANALYTICS_PAGE = 1000;
const ANALYTICS_MAX_ROWS = 100000;

function chunkList(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Pages through a query built fresh by `build()` until a short page, or until
 * `max` rows. PostgREST caps every response at the project's "Max rows"
 * (1000 by default on Supabase) whatever `.limit()` asks for, so any read
 * that means "every row" has to come through here. `build()` must order by a
 * unique key (or end with one) so pages neither overlap nor skip.
 */
async function selectAllPages(build, max = ANALYTICS_MAX_ROWS) {
  const rows = [];
  for (let offset = 0; offset < max; offset += ANALYTICS_PAGE) {
    const size = Math.min(ANALYTICS_PAGE, max - offset);
    const { data, error } = await build().range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return rows;
}

/**
 * Rows whose `idColumn` is in `ids`: chunks of ANALYTICS_ID_CHUNK ids, each
 * paged past the row cap by selectAllPages. `refine` adds filters (and may add
 * its own ordering); `order` columns are appended last so every page has a
 * stable, unique order — `id` by default, the primary key of every table read
 * this way except notification_preferences (keyed by user_id). `max` bounds
 * the rows per chunk.
 */
async function selectByIds(client, table, columns, idColumn, ids, refine = (q) => q, { order = ['id'], max } = {}) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const rows = [];
  for (const part of chunkList(unique, ANALYTICS_ID_CHUNK)) {
    const build = () => {
      let query = refine(client.from(table).select(columns).in(idColumn, part));
      for (const column of order) query = query.order(column, { ascending: true });
      return query;
    };
    rows.push(...(await selectAllPages(build, max)));
  }
  return rows;
}

const isInRange = (value, fromIso, toIso) => {
  if (!value) return false;
  const t = new Date(value).toISOString();
  return (!fromIso || t >= fromIso) && (!toIso || t < toIso);
};

const ANALYTICS_USER_COLUMNS = 'id, email, name, created_at, attribution, referred_by, is_staff';

/** Users who signed up in [fromIso, toIso). Staff accounts are left out. */
async function listSignupsBetween(fromIso, toIso) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return Array.from(memoryDb.usersById.values()).filter(
      (u) => u.is_staff !== true && isInRange(u.created_at, fromIso, toIso)
    );
  }
  const rows = await selectAllPages(() =>
    supabase
      .from('users')
      .select(ANALYTICS_USER_COLUMNS)
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
  );
  return rows.filter((u) => u.is_staff !== true);
}

/** Name/email/created_at for a set of user ids (referrers on the leaderboard). */
async function getUsersByIds(userIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return Array.from(new Set(userIds)).map((id) => memoryDb.usersById.get(id)).filter(Boolean);
  }
  return selectByIds(supabase, 'users', ANALYTICS_USER_COLUMNS, 'id', userIds);
}

/** Which of these (normalised) emails belong to an account, and since when. */
async function findUsersByEmails(emails) {
  const wanted = Array.from(new Set(emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)));
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return wanted
      .map((email) => memoryDb.usersByEmail.get(email))
      .filter(Boolean)
      .map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));
  }
  return selectByIds(supabase, 'users', 'id, email, created_at', 'email', wanted);
}

/**
 * One row per log on or after `fromDay` (YYYY-MM-DD) for these users — food,
 * water, sleep or a weigh-in — as { user_id, day }. Rows that carry a `date`
 * use it (the day the user logged it for); weigh-ins only have a timestamp,
 * so its UTC date is used.
 */
async function listActivityDays(userIds, fromDay) {
  const wanted = new Set(userIds);
  const out = [];
  const dayOf = (row) =>
    (typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.date)
      ? row.date
      : row.created_at
        ? new Date(row.created_at).toISOString()
        : ''
    ).slice(0, 10);
  const push = (row) => {
    const day = dayOf(row);
    if (day && day >= fromDay) out.push({ user_id: row.user_id, day });
  };

  if (!wanted.size) return out;

  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    for (const table of ['foodLogs', 'hydrationLogs', 'sleepLogs']) {
      for (const row of memoryDb[table]) if (wanted.has(row.user_id)) push(row);
    }
    for (const row of memoryDb.weightLogs) {
      if (wanted.has(row.user_id)) push({ user_id: row.user_id, created_at: row.created_at });
    }
    return out;
  }

  const ids = Array.from(wanted);
  const [food, hydration, sleep, weight] = await Promise.all([
    selectByIds(supabase, 'food_logs', 'user_id, date', 'user_id', ids, (q) => q.gte('date', fromDay)),
    selectByIds(supabase, 'hydration_logs', 'user_id, date, created_at', 'user_id', ids, (q) => q.gte('created_at', fromDay)),
    selectByIds(supabase, 'sleep_logs', 'user_id, date, created_at', 'user_id', ids, (q) => q.gte('created_at', fromDay)),
    selectByIds(supabase, 'weight_logs', 'user_id, created_at', 'user_id', ids, (q) => q.gte('created_at', fromDay))
  ]);
  for (const row of [...food, ...hydration, ...sleep]) push(row);
  for (const row of weight) push({ user_id: row.user_id, created_at: row.created_at });
  return out;
}

/** Every subscription row (any status) held by these users. */
async function listSubscriptionsForUsers(userIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const wanted = new Set(userIds);
    return memoryDb.subscriptions.filter((s) => wanted.has(s.user_id));
  }
  return selectByIds(
    supabase,
    'subscriptions',
    'user_id, plan, status, started_at, ends_at, created_at',
    'user_id',
    userIds
  );
}

/** Leads first captured in [fromIso, toIso). */
async function listLeadsBetween(fromIso, toIso) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.leads.filter((l) => isInRange(l.created_at, fromIso, toIso));
  }
  return selectAllPages(() =>
    supabaseServiceRole
      .from('marketing_leads')
      .select('id, email, source, utm_source, utm_medium, utm_campaign, created_at')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
  );
}

/** Referrals recorded in [fromIso, toIso). */
async function listReferralsBetween(fromIso, toIso) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.referrals.filter((r) => isInRange(r.created_at, fromIso, toIso));
  }
  return selectAllPages(() =>
    supabase
      .from('referrals')
      .select('id, referrer_id, referee_id, status, created_at')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
  );
}

/** Rewards recorded for these referrals. */
async function listRewardsForReferrals(referralIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const wanted = new Set(referralIds);
    return memoryDb.referralRewards.filter((r) => wanted.has(r.referral_id));
  }
  return selectByIds(
    supabase,
    'referral_rewards',
    'user_id, referral_id, type, amount, status, created_at',
    'referral_id',
    referralIds
  );
}

/**
 * Scheduler bulk reads — the hourly lifecycle run (utils/lifecycle-runner.js)
 * and the five-minute push reminder tick (utils/push.js).
 *
 * Both walk every recipient. They do it in pages: one keyset page of
 * recipients (ordered by id, so a row added or removed mid-run never shifts
 * the rest), then one chunked `.in()` read per table for the whole page. A
 * pass costs a few queries per SCHEDULER_PAGE recipients instead of five or
 * more per recipient. Only the columns the decisions read are selected.
 */
const SCHEDULER_PAGE = 200;

const pageAfter = (rows, key, afterId, limit) =>
  rows
    .filter((r) => afterId == null || String(r[key]) > String(afterId))
    .sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : String(a[key]) > String(b[key]) ? 1 : 0))
    .slice(0, limit);

/** Users ordered by id, `limit` after `afterId` (same columns as getAllUsers). */
async function listUsersPage({ afterId = null, limit = SCHEDULER_PAGE } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return pageAfter(Array.from(memoryDb.usersById.values()), 'id', afterId, limit);
  }
  let query = supabase.from('users').select('id, email, name, phone, created_at').order('id', { ascending: true }).limit(limit);
  if (afterId != null) query = query.gt('id', afterId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Marketing leads ordered by id, `limit` after `afterId`. */
async function listLeadsPage({ afterId = null, limit = SCHEDULER_PAGE } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return pageAfter(memoryDb.leads, 'id', afterId, limit);
  }
  let query = supabaseServiceRole.from('marketing_leads').select('*').order('id', { ascending: true }).limit(limit);
  if (afterId != null) query = query.gt('id', afterId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Stored notification preference rows for these users, keyed by user id. */
async function listNotificationPrefsFor(userIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const out = new Map();
    for (const id of userIds) if (memoryDb.notificationPrefs.has(id)) out.set(id, memoryDb.notificationPrefs.get(id));
    return out;
  }
  // Keyed by user_id (no id column): that is the stable page order.
  const rows = await selectByIds(supabaseServiceRole, 'notification_preferences', '*', 'user_id', userIds, undefined, {
    order: ['user_id']
  });
  return new Map(rows.map((row) => [row.user_id, row]));
}

const LIFECYCLE_SEND_COLUMNS =
  'id, recipient_type, recipient_id, campaign, step, period_key, channel, status, created_at, sent_at, opened_at, converted_at';

/** Every send-log row of these recipients, oldest first (as listLifecycleSends orders them). */
async function listLifecycleSendsFor(recipientType, recipientIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const wanted = new Set(recipientIds);
    return memoryDb.lifecycleSends
      .filter((s) => s.recipient_type === recipientType && wanted.has(s.recipient_id))
      .map((s) => ({ ...s }));
  }
  // Every row: a send left out would let the daily cap and "step already
  // sent" checks pass (see listLifecycleSends).
  return selectByIds(
    supabaseServiceRole,
    'lifecycle_sends',
    LIFECYCLE_SEND_COLUMNS,
    'recipient_id',
    recipientIds,
    (q) => q.eq('recipient_type', recipientType).order('created_at', { ascending: true }),
    { max: Infinity }
  );
}

/**
 * Log rows for a set of users, for the scheduler's per-user decisions.
 *
 * `tables` names what to read and how far back:
 *   { food: { since }, hydration: { since, until } | true, sleep: true, weight: true, weightGoals: true }
 * `true` is the whole history (what the per-user getters return); `since` /
 * `until` bound the `date` column (YYYY-MM-DD, inclusive), exactly like
 * getFoodLogs({ start }) and getHydrationLogs(userId, date). The caller trims
 * each user's rows to that user's own bounds.
 *
 * Returns { food, hydration, sleep, weight, weightGoals }, each a Map of
 * user id → rows, newest first like the per-user getters.
 */
const BULK_LOG_TABLES = {
  food: { memory: 'foodLogs', table: 'food_logs', columns: 'user_id, date, meal_type, calories, created_at', dated: true },
  hydration: { memory: 'hydrationLogs', table: 'hydration_logs', columns: 'user_id, date, liters_consumed, created_at', dated: true },
  sleep: { memory: 'sleepLogs', table: 'sleep_logs', columns: 'user_id, date, sleep_hours, created_at', dated: true },
  weight: { memory: 'weightLogs', table: 'weight_logs', columns: 'user_id, weight_kg, created_at', dated: false },
  weightGoals: { memory: 'weightGoals', table: 'weight_goals', columns: 'user_id, start_weight_kg, target_weight_kg, created_at', dated: false }
};

function groupByUser(rows, userIds) {
  const out = new Map(userIds.map((id) => [id, []]));
  for (const row of sortByCreatedAtDesc(rows)) {
    if (out.has(row.user_id)) out.get(row.user_id).push(row);
  }
  return out;
}

async function listLogsForUsers(userIds, tables = {}) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const result = {};
  await Promise.all(
    Object.entries(BULK_LOG_TABLES).map(async ([name, spec]) => {
      const want = tables[name];
      if (!want) return;
      const since = spec.dated && want !== true ? want.since || null : null;
      const until = spec.dated && want !== true ? want.until || null : null;
      if (!ids.length) {
        result[name] = new Map();
        return;
      }

      if (USE_MEMORY_DB) {
        maybeLogMemoryMode();
        const wanted = new Set(ids);
        const day = (r) => String(r.date || '').slice(0, 10);
        const rows = memoryDb[spec.memory].filter(
          (r) => wanted.has(r.user_id) && (!since || day(r) >= since) && (!until || day(r) <= until)
        );
        result[name] = groupByUser(rows, ids);
        return;
      }

      // user_id first, so (user_id, created_at desc) indexes return rows
      // already in order for the `in` list (no sort per range() page); the
      // id selectByIds appends breaks ties so pages never overlap or skip.
      // No row cap: the page of users bounds it, and a user's missing rows
      // would change their streak.
      const rows = await selectByIds(
        supabase,
        spec.table,
        spec.columns,
        'user_id',
        ids,
        (q) => {
          let out = q;
          if (since) out = out.gte('date', since);
          if (until) out = out.lte('date', until);
          return out.order('user_id', { ascending: true }).order('created_at', { ascending: false });
        },
        { max: Infinity }
      );
      result[name] = groupByUser(rows, ids);
    })
  );
  return result;
}

/** `users.preferences` for these users (what getUserPreferences returns), keyed by id. */
async function listUserPreferencesFor(userIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const out = new Map();
    for (const id of new Set(userIds)) {
      const user = memoryDb.usersById.get(id);
      if (user) out.set(id, user.preferences || {});
    }
    return out;
  }
  const rows = await selectByIds(supabase, 'users', 'id, preferences', 'id', userIds);
  return new Map(rows.map((row) => [row.id, row.preferences || {}]));
}

/** Each user's newest survey — only the target columns the reminders read — keyed by user id. */
async function listLatestSurveysFor(userIds) {
  let rows;
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const wanted = new Set(userIds);
    rows = memoryDb.surveys.filter((s) => wanted.has(s.user_id));
  } else {
    rows = await selectByIds(supabase, 'surveys', 'user_id, water_target_liters, sleep_target_hours, created_at', 'user_id', userIds, (q) =>
      q.order('created_at', { ascending: false })
    );
  }
  const out = new Map();
  for (const row of sortByCreatedAtDesc(rows)) if (!out.has(row.user_id)) out.set(row.user_id, row);
  return out;
}

/** Enabled reminder settings ordered by user id, `limit` after `afterUserId`. */
async function listEnabledPushReminderSettingsPage({ afterUserId = null, limit = SCHEDULER_PAGE } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return pageAfter(memoryDb.pushReminderSettings.filter((r) => r.enabled), 'user_id', afterUserId, limit);
  }
  let query = supabaseServiceRole
    .from('push_reminder_settings')
    .select('user_id, enabled, tz, lang, settings, state')
    .eq('enabled', true)
    .order('user_id', { ascending: true })
    .limit(limit);
  if (afterUserId != null) query = query.gt('user_id', afterUserId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Which of these users have at least one push subscription. */
async function listUsersWithPushSubscriptions(userIds) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const wanted = new Set(userIds);
    return new Set(memoryDb.pushSubscriptions.filter((r) => wanted.has(r.user_id)).map((r) => r.user_id));
  }
  const rows = await selectByIds(supabaseServiceRole, 'push_subscriptions', 'user_id', 'user_id', userIds);
  return new Set(rows.map((r) => r.user_id));
}

module.exports = {
  saveWhatsappMessage,
  getWhatsappMessages,
  supabase,
  initializeDatabase,
  isMemoryMode,
  ping,
  // Users
  getUser,
  getUserByEmail,
  getAllUsers,
  createUser,
  updateUserPasswordHash,
  bumpTokenVersion,
  deleteUser,
  getMealPlans,
  getMealPlanById,
  createMealPlans,
  deleteMealPlansInRange,
  updateMealPlan,
  deleteMealPlan,
  getActiveSubscriptions,
  hasEntitlement,
  createSubscription,
  recordPaymentEvent,
  // Marketing leads
  createLead,
  listLeads,
  getLeadById,
  getLeadByEmail,
  updateLead,
  deleteLead,
  // Lifecycle messaging
  getNotificationPrefs,
  listNotificationPrefs,
  upsertNotificationPrefs,
  claimLifecycleSend,
  updateLifecycleSend,
  listLifecycleSends,
  markLifecycleConverted,
  deleteLifecycleSendsFor,
  NOTIFICATION_DEFAULTS,
  setUserPhone,
  getUserByPhone,
  getWhatsappAccess,
  upsertFoods,
  searchFoods,
  getFoodById,
  countFoods,
  getUserPreferences,
  updateUserPreferences,
  // Surveys
  createSurvey,
  getSurveys,
  getLatestSurvey,
  getSurveyById,
  // Weight Goals
  createWeightGoal,
  getWeightGoals,
  getWeightGoalById,
  // Weight Logs
  createWeightLog,
  getWeightLogs,
  // Hydration
  createHydrationLog,
  getHydrationLogs,
  // Sleep
  createSleepLog,
  getSleepLogs,
  // Fasting
  createFastingWindow,
  getFastingWindows,
  // Meal Swaps
  createMealSwap,
  getMealSwaps,
  // Readiness
  createReadinessScore,
  getReadinessScores,
  // Offline
  createOfflineLog,
  getOfflineLogs,
  markOfflineLogSynced,
  // Food logs
  createFoodLog,
  createFoodLogTemplate,
  getFoodLogTemplates,
  getFoodLogTemplateById,
  updateFoodLogTemplate,
  createFoodLogs,
  deleteFoodLogs,
  getFoodLogs,
  getFoodDays,
  getFoodLogById,
  deleteFoodLog,
  updateFoodLog,
  deleteFoodLogTemplate,
  // WHAPI bot conversations
  getWhapiConversation,
  upsertWhapiConversation,
  logWhapiMessage,
  getRecentWhapiMessages,
  getWhapiTranscript,
  // Referrals
  getUserByReferralCode,
  ensureReferralCode,
  setUserAttribution,
  // Onboarding
  setOnboardingCompletedAt,
  createReferral,
  getReferralsByReferrer,
  countSubscribedUsers,
  createReferralReward,
  getReferralRewards,
  // Marketing analytics (bulk reads)
  listSignupsBetween,
  getUsersByIds,
  findUsersByEmails,
  listActivityDays,
  listSubscriptionsForUsers,
  listLeadsBetween,
  listReferralsBetween,
  listRewardsForReferrals,
  // Web Push
  savePushSubscription,
  getPushSubscriptions,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  markPushSubscriptionResult,
  getPushReminderSettings,
  savePushReminderSettings,
  updatePushReminderState,
  listEnabledPushReminderSettings,
  // Scheduler bulk reads (lifecycle run, push reminder tick)
  SCHEDULER_PAGE,
  listUsersPage,
  listLeadsPage,
  listNotificationPrefsFor,
  listLifecycleSendsFor,
  listLogsForUsers,
  listUserPreferencesFor,
  listLatestSurveysFor,
  listEnabledPushReminderSettingsPage,
  listUsersWithPushSubscriptions
};
