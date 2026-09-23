const { createClient } = require('@supabase/supabase-js');
const { randomUUID: uuidv4 } = require('crypto');
const { normalizePhone } = require('./phone');

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
  chefRequests: [],
  foods: [],
  whapiConversations: new Map(),
  whapiMessages: []
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
    notes: row.notes ?? null
  };
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
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, created_at');
  
  if (error) throw error;
  return data || [];
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
    return true;
  }

  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
  return true;
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
    const lower = needle.toLowerCase();
    return memoryDb.foods
      .filter(
        (f) =>
          String(f.name_he || '').includes(needle) ||
          String(f.name_en || '').toLowerCase().includes(lower) ||
          (Array.isArray(f.aliases_he) && f.aliases_he.some((a) => String(a).includes(needle)))
      )
      .slice(0, limit);
  }

  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .or(`name_he.ilike.%${needle}%,name_en.ilike.%${needle}%`)
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function getFoodById(foodId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.foods.find((f) => f.id === foodId) || null;
  }

  const { data, error } = await supabase.from('foods').select('*').eq('id', foodId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function countFoods() {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
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
  let query = supabase
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId);
  
  if (goalId) {
    query = query.eq('goal_id', goalId);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
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
  let query = supabase
    .from('hydration_logs')
    .select('*')
    .eq('user_id', userId);
  
  if (date) {
    query = query.eq('date', date);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
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
  let query = supabase
    .from('sleep_logs')
    .select('*')
    .eq('user_id', userId);
  
  if (date) {
    query = query.eq('date', date);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
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

  const { data, error } = await supabase
    .from('food_logs')
    .insert([
      {
        user_id: userId,
        ...foodLog
      }
    ])
    .select('*')
    .single();

  if (error) throw error;
  return normalizeFoodLogRow(data);
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
    return normalizeFoodLogRow(row);
  }

  const { data, error } = await supabase
    .from('food_log_templates')
    .insert([
      {
        user_id: userId,
        ...template
      }
    ])
    .select('*')
    .single();

  if (error) throw error;
  return normalizeFoodLogRow(data);
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

    return sliced.map(normalizeFoodLogRow);
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
  return (data || []).map(normalizeFoodLogRow);
}

async function deleteFoodLogTemplate(userId, templateId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const idx = memoryDb.foodLogTemplates.findIndex(r => r.id === templateId && r.user_id === userId);
    if (idx === -1) return null;
    const removed = memoryDb.foodLogTemplates[idx];
    memoryDb.foodLogTemplates.splice(idx, 1);
    return normalizeFoodLogRow(removed);
  }

  const { data, error } = await supabase
    .from('food_log_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return normalizeFoodLogRow(data || null);
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

  query = query.order('created_at', { ascending: false });

  if (limit != null) {
    const offsetNum = offset == null ? 0 : Number(offset);
    const limitNum = Number(limit);
    if (Number.isFinite(offsetNum) && Number.isFinite(limitNum) && limitNum > 0 && offsetNum >= 0) {
      query = query.range(offsetNum, offsetNum + limitNum - 1);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeFoodLogRow);
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
  getWhapiTranscript
};
