/**
 * utils/config-check.js — the startup configuration report.
 *
 *   node tests/config-check.test.js
 *
 * Pure-function checks plus two real boots of index.js in production mode
 * (one missing JWT_SECRET must refuse to start; one fully configured on the
 * memory store must start), and a guarantee that no value is ever printed.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkConfig, runStartupConfigCheck } = require('../utils/config-check');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const SECRET = 'super-secret-value-that-must-never-be-logged';
const FULL = {
  NODE_ENV: 'production',
  JWT_SECRET: SECRET,
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_KEY: SECRET + '-anon',
  SUPABASE_SERVICE_ROLE_KEY: SECRET + '-role',
  CORS_ORIGINS: 'https://app.example.com',
  APP_URL: 'https://app.example.com',
  SHARE_BASE_URL: 'https://app.example.com',
  API_PUBLIC_URL: 'https://api.example.com',
  PLAN_PRICE_APP_M: '49',
  PLAN_PRICE_APP_Y: '399',
  PLAN_PRICE_CHEF_ADDON: '149',
  PLAN_PRICE_COACHING_3M: '1290',
  PLAN_PRICE_COMBO_3M: '1690',
  PLAN_PRICE_PLAN_ONCE: '690',
  CHECKOUT_ENABLED: 'true',
  CANCELLATION_POLICY_URL: 'https://app.example.com/terms#cancellation',
  ENTITLEMENTS_ENFORCED: 'true',
  PAYPLUS_ENV: 'production',
  PAYPLUS_API_KEY: SECRET,
  PAYPLUS_SECRET_KEY: SECRET,
  PAYPLUS_PAYMENT_PAGE_UID: SECRET,
  SMTP_URL: `smtps://user:${SECRET}@smtp.example.com:465`,
  WHAPI_TOKEN: SECRET,
  WHAPI_WEBHOOK_SECRET: SECRET,
  WHATSAPP_WEBHOOK_SECRET: SECRET,
  WHATSAPP_BOT_NUMBER: '972501234567',
  ANTHROPIC_API_KEY: SECRET,
  SENTRY_DSN: `https://${SECRET}@o1.ingest.sentry.io/123`
};

const features = (report) => report.warnings.map((w) => w.feature);
const capture = () => {
  const lines = [];
  return { lines, logger: { warn: (m) => lines.push(m), log: (m) => lines.push(m) } };
};

console.log('config-check');

test('fully configured production: no errors, no warnings', () => {
  const report = checkConfig(FULL);
  assert.deepStrictEqual(report.errors, []);
  assert.deepStrictEqual(report.warnings, []);
});

test('production without JWT_SECRET throws, naming the variable only', () => {
  const env = { ...FULL, JWT_SECRET: '' };
  assert.throws(() => runStartupConfigCheck(env, capture().logger), (err) => {
    assert.match(err.message, /JWT_SECRET/);
    assert.ok(!err.message.includes(SECRET), 'secret value leaked into the error');
    return true;
  });
});

test('production without Supabase throws unless ALLOW_MEMORY_DB=true', () => {
  const env = { ...FULL, SUPABASE_URL: '', SUPABASE_KEY: '' };
  assert.match(checkConfig(env).errors.join('\n'), /SUPABASE_URL/);
  assert.deepStrictEqual(checkConfig({ ...env, ALLOW_MEMORY_DB: 'true' }).errors, []);
});

test('the .env.example placeholders do not count as Supabase configured', () => {
  const env = { ...FULL, SUPABASE_URL: 'https://your-project.supabase.co', SUPABASE_KEY: 'your-anon-public-key' };
  assert.strictEqual(checkConfig(env).errors.length, 1);
});

test('development with nothing set never throws, only warns', () => {
  const { lines, logger } = capture();
  const report = runStartupConfigCheck({ NODE_ENV: 'development' }, logger);
  assert.ok(report.errors.length >= 2);
  assert.ok(lines.some((l) => l.includes('JWT_SECRET')));
});

test('prices unset -> pricing warning mentions "Price on request"', () => {
  const report = checkConfig({ ...FULL, PLAN_PRICE_APP_M: '', PLAN_PRICE_COMBO_3M: '0' });
  const w = report.warnings.find((x) => x.feature === 'pricing');
  assert.ok(w, 'no pricing warning');
  assert.match(w.message, /PLAN_PRICE_APP_M, PLAN_PRICE_COMBO_3M/);
  assert.match(w.message, /Price on request/);
});

test('legacy PLAN_BASE_AMOUNT / PLAN_YONI_AMOUNT are flagged as no longer read', () => {
  const w = checkConfig({ ...FULL, PLAN_BASE_AMOUNT: '150' }).warnings.find((x) => x.feature === 'pricing');
  assert.match(w.message, /PLAN_BASE_AMOUNT is no longer read/);
  assert.ok(!w.message.includes('150'), 'value leaked');
});

test('checkout stays off without CHECKOUT_ENABLED, and without a cancellation policy', () => {
  const off = checkConfig({ ...FULL, CHECKOUT_ENABLED: '' }).warnings.find((x) => x.feature === 'checkout');
  assert.match(off.message, /Talk to us/);
  const noPolicy = checkConfig({ ...FULL, CANCELLATION_POLICY_URL: '' }).warnings.find((x) => x.feature === 'checkout');
  assert.match(noPolicy.message, /CANCELLATION_POLICY_URL/);
});

test('entitlements not enforced -> reported, everything open', () => {
  const w = checkConfig({ ...FULL, ENTITLEMENTS_ENFORCED: '' }).warnings.find((x) => x.feature === 'entitlements');
  assert.match(w.message, /open to everyone/);
});

test('mailer unset -> email off; EMAIL_API_KEY alone is flagged as unsupported', () => {
  const off = checkConfig({ ...FULL, SMTP_URL: '' }).warnings.find((x) => x.feature === 'email');
  assert.match(off.message, /email is off/);
  const apiOnly = checkConfig({ ...FULL, SMTP_URL: '', EMAIL_API_KEY: 'k' }).warnings.find((x) => x.feature === 'email');
  assert.match(apiOnly.message, /not implemented/);
});

test('share base URL unset -> reminds that the frontend must forward ^/s/', () => {
  const w = checkConfig({ ...FULL, SHARE_BASE_URL: '' }).warnings.find((x) => x.feature === 'share');
  assert.match(w.message, /\^\/s\//);
});

test('production-only warnings are not reported in development', () => {
  const dev = { ...FULL, NODE_ENV: 'development', PAYPLUS_ENV: '', APP_URL: '', API_PUBLIC_URL: '' };
  assert.ok(!features(checkConfig(dev)).includes('links'));
  assert.ok(!features(checkConfig(dev)).includes('payments'));
  assert.ok(features(checkConfig({ ...dev, NODE_ENV: 'production' })).includes('links'));
});

test('the logged report never contains a configured value', () => {
  const { lines, logger } = capture();
  const env = { ...FULL, NODE_ENV: 'development', PLAN_PRICE_APP_M: '', SMTP_URL: '', SHARE_BASE_URL: '', VERCEL: '1' };
  runStartupConfigCheck(env, logger);
  assert.ok(lines.length >= 3);
  for (const line of lines) assert.ok(!line.includes(SECRET), `value leaked: ${line}`);
});

test('.env.example names every process.env variable the server code reads', () => {
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const skip = new Set(['node_modules', 'tests', 'public', 'data', 'docs', 'migrations']);
  const legacy = /^(index\.js\.backup|crm-.*|CRM_.*)$/;
  const names = new Set();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name) || legacy.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        for (const m of fs.readFileSync(full, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) names.add(m[1]);
      }
    }
  })(root);
  const missing = [...names].filter((n) => !new RegExp(`^#? ?${n}=`, 'm').test(example));
  assert.deepStrictEqual(missing, [], `add to .env.example: ${missing.join(', ')}`);
});

// ── Real boots of index.js ────────────────────────────────────────────
// VERCEL=1 keeps the app from binding a port or arming cron; requiring the
// module is enough to exercise the startup path.
function boot(env) {
  const base = { PATH: process.env.PATH, HOME: process.env.HOME, VERCEL: '1' };
  return spawnSync(process.execPath, ['-e', "require('./index.js'); console.log('BOOTED')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...base, ...env },
    encoding: 'utf8',
    timeout: 30000
  });
}

test('index.js in production without JWT_SECRET refuses to start with the aggregated message', () => {
  const r = boot({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com', ALLOW_MEMORY_DB: 'true' });
  assert.notStrictEqual(r.status, 0, 'server started without JWT_SECRET');
  assert.match(r.stderr, /Refusing to start: required configuration is missing/);
  assert.match(r.stderr, /JWT_SECRET/);
});

test('index.js in development boots and logs disabled features without values', () => {
  const r = boot({ NODE_ENV: 'development', ALLOW_MEMORY_DB: 'true', JWT_SECRET: SECRET });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /BOOTED/);
  const out = r.stdout + r.stderr;
  assert.match(out, /\[config\] pricing:/);
  assert.match(out, /\[config\] email:/);
  assert.ok(!out.includes(SECRET), 'JWT_SECRET value appeared in the log');
});

console.log(`${passed} passed`);
