/**
 * Fast food logging — the pure parts.
 *
 * Nothing here touches the database or the clock on its own: callers pass the
 * rows and `now`, so ranking and date arithmetic are testable to the hour.
 *
 *   rankSuggestions   "Log again" chips: the user's own foods, ranked by how
 *                     often (frequency), how lately (recency) and whether they
 *                     are usually eaten at this meal and hour (time of day).
 *   mealForHour       which meal slot a local hour most likely means.
 *   scaleFood         per-100 g catalog values → a portion (same arithmetic as
 *                     POST /api/foods/calculate).
 *   rankFoodMatches   catalog search order: exact name/alias, then prefix,
 *                     then contains.
 */

const { isValidTimeZone } = require('./engagement');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAY_MS = 86400000;

// A log two weeks old counts half as much as one from today.
const RECENCY_HALF_LIFE_DAYS = 14;
// Logged at a different meal slot than the one asked for: still a candidate
// (people eat eggs for dinner), but well behind the ones from this slot.
const OTHER_SLOT_WEIGHT = 0.25;
// Logged within ±2 local hours of now.
const SAME_HOUR_WINDOW = 2;
const SAME_HOUR_BOOST = 1.5;

/** Local hour (0-23) of an instant in an IANA zone; UTC when the zone is bad. */
function localHour(instant, tz = 'UTC') {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour % 24 : null;
}

/** The meal slot a local hour most likely means. */
function mealForHour(hour) {
  if (hour == null || !Number.isFinite(hour)) return 'snack';
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

/** YYYY-MM-DD plus `n` calendar days (UTC arithmetic on a plain date — no DST). */
function addDaysIso(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const normalizeName = (name) => String(name || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/** Same food: the catalog id when there is one, the spelling otherwise. */
function foodKey(log) {
  return log.food_id ? `food:${log.food_id}` : `name:${normalizeName(log.name)}`;
}

function hourDistance(a, b) {
  const diff = Math.abs(a - b) % 24;
  return Math.min(diff, 24 - diff);
}

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param {Array<object>} logs food_logs rows (any order, one user's)
 * @param {{ meal?: string|null, tz?: string, now?: Date, limit?: number }} opts
 * @returns {Array<object>} best first
 */
function rankSuggestions(logs, { meal = null, tz = 'UTC', now = new Date(), limit = 8 } = {}) {
  const nowMs = now.getTime();
  const nowHour = localHour(now, tz);
  const groups = new Map();

  for (const log of logs || []) {
    if (!log || !normalizeName(log.name)) continue;
    const at = new Date(log.created_at || `${log.date}T12:00:00Z`);
    const atMs = Number.isNaN(at.getTime()) ? nowMs : at.getTime();
    const ageDays = Math.max(0, (nowMs - atMs) / DAY_MS);

    let weight = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    if (meal && log.meal_type !== meal) weight *= OTHER_SLOT_WEIGHT;
    const hour = log.created_at ? localHour(at, tz) : null;
    if (hour != null && nowHour != null && hourDistance(hour, nowHour) <= SAME_HOUR_WINDOW) {
      weight *= SAME_HOUR_BOOST;
    }

    const key = foodKey(log);
    const g = groups.get(key) || { key, score: 0, count: 0, last: null, lastMs: -Infinity, slots: {} };
    g.score += weight;
    g.count += 1;
    if (log.meal_type) g.slots[log.meal_type] = (g.slots[log.meal_type] || 0) + 1;
    if (atMs > g.lastMs) {
      g.lastMs = atMs;
      g.last = log;
    }
    groups.set(key, g);
  }

  return Array.from(groups.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.count - a.count ||
        b.lastMs - a.lastMs ||
        normalizeName(a.last.name).localeCompare(normalizeName(b.last.name))
    )
    .slice(0, Math.max(1, limit))
    .map((g) => {
      const l = g.last;
      const usualSlot = Object.entries(g.slots).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return {
        key: g.key,
        name: l.name,
        foodId: l.food_id || null,
        mealType: meal || usualSlot || l.meal_type || null,
        calories: num(l.calories) ?? 0,
        proteinGrams: num(l.protein_grams),
        carbsGrams: num(l.carbs_grams),
        fatGrams: num(l.fat_grams),
        quantity: num(l.quantity),
        unit: l.unit || null,
        count: g.count,
        lastDate: l.date || null,
        score: Math.round(g.score * 1000) / 1000
      };
    });
}

const round1 = (value) => (value == null ? null : Math.round(value * 10) / 10);

/** Per-100 g catalog row scaled to `grams`. Unknown values stay null. */
function scaleFood(food, grams) {
  const factor = grams / 100;
  const scale = (value) => (value == null ? null : round1(Number(value) * factor));
  return {
    kcal: scale(food.kcal_per_100g),
    proteinG: scale(food.protein_g),
    carbsG: scale(food.carbs_g),
    fatG: scale(food.fat_g)
  };
}

/**
 * Catalog rows that match `needle`, best first: exact name or alias, then a
 * name/alias that starts with it, then one that contains it. Hebrew is
 * compared as typed, English case-insensitively.
 */
function rankFoodMatches(foods, needle, limit = 20) {
  const n = String(needle || '').trim();
  if (!n) return [];
  const lower = n.toLocaleLowerCase();
  const rank = (f) => {
    const names = [f.name_he, ...(Array.isArray(f.aliases_he) ? f.aliases_he : [])].map((s) => String(s || ''));
    const en = String(f.name_en || '').toLocaleLowerCase();
    if (names.includes(n) || en === lower) return 0;
    if (names.some((s) => s.startsWith(n)) || en.startsWith(lower)) return 1;
    if (names.some((s) => s.includes(n)) || en.includes(lower)) return 2;
    return -1;
  };
  return foods
    .map((f) => ({ f, r: rank(f) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || String(a.f.name_he).length - String(b.f.name_he).length)
    .slice(0, limit)
    .map((x) => x.f);
}

/**
 * Hebrew synonyms live in data/food-catalog-he.json (aliases_he: "עגבניות",
 * "עגבניה" for "עגבנייה"); the sourced rows mostly do not carry them. These
 * two helpers let search find a food by any of its names in both stores.
 */
let aliasIndex = null;
function catalogAliases() {
  if (aliasIndex) return aliasIndex;
  aliasIndex = new Map();
  try {
    for (const f of require('../data/food-catalog-he.json').foods || []) {
      if (Array.isArray(f.aliases_he) && f.aliases_he.length) aliasIndex.set(f.name_he, f.aliases_he);
    }
  } catch {
    /* no catalog: search by name only */
  }
  return aliasIndex;
}

/** The row with the catalog's synonyms merged into aliases_he. */
function withCatalogAliases(food) {
  const extra = catalogAliases().get(food.name_he);
  if (!extra) return food;
  const own = Array.isArray(food.aliases_he) ? food.aliases_he : [];
  return { ...food, aliases_he: Array.from(new Set([...own, ...extra])) };
}

/** Canonical Hebrew names whose synonym starts with (or equals) `needle`. */
function namesForSynonym(needle) {
  const n = String(needle || '').trim();
  if (n.length < 2) return [];
  const out = [];
  for (const [name, aliases] of catalogAliases()) {
    if (aliases.some((a) => String(a).startsWith(n))) out.push(name);
  }
  return out;
}

module.exports = {
  withCatalogAliases,
  namesForSynonym,
  MEAL_TYPES,
  localHour,
  mealForHour,
  addDaysIso,
  foodKey,
  rankSuggestions,
  scaleFood,
  rankFoodMatches
};
