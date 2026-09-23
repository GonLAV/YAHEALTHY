const { createClient } = require('@supabase/supabase-js');
const { randomUUID: uuidv4 } = require('crypto');

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
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.subscriptions.filter(
      (row) => row.user_id === userId && row.status === 'active'
    );
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;
  return data || [];
}

async function hasEntitlement(userId, plan) {
  const active = await getActiveSubscriptions(userId);
  return active.some((row) => row.plan === plan);
}

/**
 * Start a subscription, or leave the existing one alone.
 *
 * A repeated callback must not produce a second active row, so the collision
 * is treated as "already subscribed" rather than as an error. Postgres code
 * 23505 is the unique violation from subscriptions_one_active_per_plan.
 */
async function createSubscription(userId, plan) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const existing = memoryDb.subscriptions.find(
      (row) => row.user_id === userId && row.plan === plan && row.status === 'active'
    );
    if (existing) return { subscription: existing, created: false };

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

  const { data, error } = await supabase
    .from('subscriptions')
    .insert([{ user_id: userId, plan, status: 'active' }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const active = await getActiveSubscriptions(userId);
      return { subscription: active.find((row) => row.plan === plan) || null, created: false };
    }
    throw error;
  }
  return { subscription: data, created: true };
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
 * Chef requests — ADR-007. The chef is a person, so "we will have him get in
 * touch" has to be a row somebody can look at, not a sentence a bot said.
 */
async function getOpenChefRequest(userId) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return memoryDb.chefRequests.find((row) => row.user_id === userId && row.status === 'open') || null;
  }

  const { data, error } = await supabase
    .from('chef_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Open a request, or hand back the one already open.
 *
 * Pressing the button twice must not put two conversations in front of the
 * chef, so the partial unique index decides rather than a read-then-write.
 */
async function createChefRequest(userId, note) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const existing = await getOpenChefRequest(userId);
    if (existing) return { request: existing, created: false };

    const row = {
      id: uuidv4(),
      user_id: userId,
      status: 'open',
      note: note || null,
      requested_at: new Date().toISOString(),
      contacted_at: null
    };
    memoryDb.chefRequests.push(row);
    return { request: row, created: true };
  }

  const { data, error } = await supabase
    .from('chef_requests')
    .insert([{ user_id: userId, note: note || null }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { request: await getOpenChefRequest(userId), created: false };
    }
    throw error;
  }
  return { request: data, created: true };
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
 * WHAPI BOT CONVERSATIONS (Adi + the chef) -- see migrations/001 and 003.
 *
 * migrations/003 renames the stored active_bot value from 'nuri' to 'adi'
 * and updates the check constraint to match. Everything above this file
 * (routes/whapi.js, whapi-brain.js) only ever deals in 'adi'/'chef' -- but
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
const LEGACY_ACTIVE_BOT = { adi: 'nuri' };
const CANONICAL_ACTIVE_BOT = { nuri: 'adi' };
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

async function getWhatsappMessages({ status = null, limit = 50 } = {}) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    return sortByCreatedAtDesc(
      memoryDb.whatsappMessages.filter(r => !status || r.status === status)
    ).slice(0, limit);
  }

  let q = supabase
    .from('whatsapp_messages')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function logWhapiMessage(phone, role, content) {
  if (USE_MEMORY_DB) {
    maybeLogMemoryMode();
    const row = { phone, role, content, created_at: new Date().toISOString() };
    memoryDb.whapiMessages.push(row);
    return row;
  }
  const { data, error } = await supabaseServiceRole
    .from('whapi_messages')
    .insert([{ phone, role, content, created_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) throw error;
  return data;
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
  getOpenChefRequest,
  createChefRequest,
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
  getRecentWhapiMessages
};
