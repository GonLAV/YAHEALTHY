/**
 * Start the backend on the in-memory store, filled with a believable week, so
 * the app can be opened and clicked through without a database.
 *
 *   npm run demo            (from YAHEALTHYbackend)
 *
 * Then run the frontend as usual (`npm run dev` in YAHEALTHYFrontend) and open
 * http://localhost:5173. Sign in with the demo account printed at startup.
 *
 * Nothing here touches Supabase, PayPlus, Google, WHAPI or Anthropic: the
 * Supabase settings from .env are blanked before the server loads, so a demo
 * can never write into a real database. Everything is gone when it stops.
 */

// Before anything reads the environment: dotenv never overrides a variable
// that is already set, so blanking these here wins over .env.
Object.assign(process.env, {
  ALLOW_MEMORY_DB: 'true',
  SUPABASE_URL: '',
  SUPABASE_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REFRESH_TOKEN: '',
  WHAPI_TOKEN: '',
  PAYPLUS_API_KEY: '',
  PAYPLUS_SECRET_KEY: '',
  ANTHROPIC_API_KEY: '',
  SMTP_URL: '',
  EMAIL_API_KEY: ''
});
const defaults = {
  PORT: '5000',
  APP_URL: 'http://localhost:5173',
  PLAN_BASE_AMOUNT: '150',
  PLAN_YONI_AMOUNT: '250',
  SESSION_SUPERMARKET_AMOUNT: '800',
  PRODUCT_MENU_AMOUNT: '400',
  // A stand-in payment page instead of PayPlus (utils/payplus.js, isDemo):
  // purchases can be clicked through, and nothing is charged.
  DEMO_PAYMENTS: 'true',
  BOOKING_CLINIC_ADDRESS: 'כתובת לדוגמה (הדגמה)'
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;

require('../index.js');
const db = require('../utils/database');

const BASE = `http://localhost:${process.env.PORT}`;
const DEMO = { email: 'demo@yahealthy.test', password: 'demo-password-1234', name: 'דנה (הדגמה)' };

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function call(method, route, body, token) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

// A plausible week of meals: breakfast, lunch, dinner, a snack.
const MEALS = [
  ['breakfast', 'שקשוקה', 350, 20, 18, 22],
  ['lunch', 'סלט עוף עם קינואה', 520, 42, 45, 16],
  ['dinner', 'סלמון בתנור עם ירקות', 610, 38, 30, 34],
  ['snack', 'יוגורט עם פירות', 180, 10, 26, 4]
];

async function seed() {
  await waitForServer();

  const signup = await call('POST', '/api/auth/signup', { email: DEMO.email, password: DEMO.password });
  const token = signup.token || signup.access_token;

  // Staff, and a Yoni subscriber — so every screen, including /staff and the
  // paid chef, has something to show. The memory store hands back the live
  // object, which is why setting the flag on it sticks.
  const user = await db.getUserByEmail(DEMO.email);
  user.is_staff = true;
  user.name = DEMO.name;
  await db.createSubscription(user.id, 'yoni');

  await call('POST', '/api/surveys', { gender: 'female', age: 34, heightCm: 165, weightKg: 68, targetWeightKg: 63, targetDays: 120, lifestyle: 'moderate' }, token);

  for (let offset = -6; offset <= 0; offset++) {
    const date = day(offset);
    for (const [mealType, name, calories, protein, carbs, fat] of offset === 0 ? MEALS.slice(0, 2) : MEALS) {
      await call('POST', '/api/food-logs', { date, name, calories, mealType, proteinGrams: protein, carbsGrams: carbs, fatGrams: fat }, token);
    }
    await call('POST', '/api/hydration-logs', { date, litersConsumed: 1.6 + ((offset + 6) % 3) * 0.3 }, token);
    await call('POST', '/api/sleep-logs', { date, sleepHours: 6.5 + ((offset + 7) % 4) * 0.5, sleepQuality: 3 + ((offset + 7) % 3) }, token);
  }

  const goal = await call('POST', '/api/weight-goals', { startWeightKg: 68, targetWeightKg: 63, weighInDays: [0, 3] }, token).catch(() => null);
  if (goal?.id) await call('POST', '/api/weight-logs', { goalId: goal.id, weightKg: 67.2 }, token).catch(() => {});

  await call('POST', '/api/meal-plans', { recipeId: 'recipe_1', date: day(0), mealType: 'breakfast' }, token).catch(() => {});
  await call('POST', '/api/meal-plans', { recipeId: 'recipe_2', date: day(1), mealType: 'dinner' }, token).catch(() => {});

  // Two customers who booked, so the staff screen is not empty.
  const slots = (await call('GET', '/api/booking/slots?type=online')).slots;
  if (slots[1]) await call('POST', '/api/booking', { type: 'online', start: slots[1].start, name: 'נועה לוי (הדגמה)', phone: '050-0000001', email: 'noa@example.com' });
  const physical = (await call('GET', '/api/booking/slots?type=physical')).slots;
  if (physical[4]) await call('POST', '/api/booking', { type: 'physical', start: physical[4].start, name: 'יוסי כהן (הדגמה)', phone: '050-0000002', notes: 'מעדיף בוקר' });

  console.log(
    `\n  ✔ Demo ready — in-memory, nothing is saved.\n` +
      `    App:       ${process.env.APP_URL}   (run the frontend: npm run dev in YAHEALTHYFrontend)\n` +
      `    Sign in:   ${DEMO.email}\n` +
      `    Password:  ${DEMO.password}\n` +
      `    The demo account is staff and has the Yoni plan.\n` +
      `    Payments go to a demo payment page — nothing is charged.\n`
  );
}

seed().catch((err) => {
  console.error('[demo] seeding failed:', err.message);
});
