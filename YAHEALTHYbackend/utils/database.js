const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';

const USE_MEMORY_DB =
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_KEY ||
  SUPABASE_URL === 'https://your-supabase-url.supabase.co' ||
  SUPABASE_KEY === 'your-supabase-anon-key';

// Initialize Supabase client (only used when configured)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  readinessScores: [],
  offlineLogs: [],
  foodLogs: [],
  foodLogTemplates: []
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
 * Update user preferences JSON
 */
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

module.exports = {
  supabase,
  initializeDatabase,
  isMemoryMode,
  ping,
  // Users
  getUser,
  getUserByEmail,
  createUser,
  updateUserPasswordHash,
  updateUserPreferences,
  // Surveys
  createSurvey,
  getSurveys,
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
  deleteFoodLogTemplate
};
