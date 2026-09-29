/**
 * Startup configuration check.
 *
 * Runs once when the server boots (index.js, right after dotenv) and answers
 * two questions in the log, without ever printing a value:
 *
 *   1. Is anything the server cannot run without missing?  In production
 *      (NODE_ENV=production) that stops the boot with one message listing all
 *      of them, instead of the first module that happens to notice.
 *   2. Which optional features are off because their env is not set?  Those
 *      are logged as one-line warnings and never stop anything.
 *
 * This module only reports. It does not change what any feature does when its
 * variable is missing — each owner module (utils/auth.js, utils/database.js,
 * utils/mailer.js, routes/payments.js, ...) keeps its own behaviour. Only
 * variable NAMES appear in the output, never values.
 *
 * Adding a feature that reads env? Add a line to OPTIONAL below and to
 * .env.example; tests/config-check.test.js keeps the contract honest.
 */

const defaultLogger = require('./logger').child({ component: 'config' });

const isSet = (env, name) => typeof env[name] === 'string' && env[name].trim() !== '';

// Placeholders shipped in .env.example / utils/database.js. A deploy that
// copied the example file verbatim has not configured Supabase.
const SUPABASE_PLACEHOLDERS = new Set([
  'https://your-supabase-url.supabase.co',
  'https://your-project.supabase.co',
  'your-supabase-anon-key',
  'your-anon-public-key'
]);

function supabaseConfigured(env) {
  return ['SUPABASE_URL', 'SUPABASE_KEY'].every(
    (name) => isSet(env, name) && !SUPABASE_PLACEHOLDERS.has(env[name].trim())
  );
}

/** Things production cannot run without. Each returns a message or null. */
const REQUIRED = [
  (env) =>
    isSet(env, 'JWT_SECRET')
      ? null
      : 'JWT_SECRET is not set (tokens could not be signed or verified safely).',
  (env) =>
    env.ALLOW_MEMORY_DB === 'true' || supabaseConfigured(env)
      ? null
      : 'SUPABASE_URL / SUPABASE_KEY are not set (and ALLOW_MEMORY_DB is not "true").',
  (env) =>
    isSet(env, 'CORS_ORIGINS')
      ? null
      : 'CORS_ORIGINS is not set (the browser app would be refused by the API).'
];

/**
 * Optional features. `off(env)` returns a message when the feature is
 * disabled or degraded, otherwise null. `prodOnly` lines are only reported in
 * production, where the development default would be wrong.
 */
const OPTIONAL = [
  {
    feature: 'pricing',
    off: (env) => {
      const missing = ['PLAN_BASE_AMOUNT', 'PLAN_YONI_AMOUNT'].filter(
        (name) => !(Number(env[name]) > 0)
      );
      return missing.length
        ? `${missing.join(', ')} unset -> landing shows "Price on request" and checkout refuses that plan.`
        : null;
    }
  },
  {
    feature: 'payments',
    off: (env) => {
      const missing = ['PAYPLUS_API_KEY', 'PAYPLUS_SECRET_KEY', 'PAYPLUS_PAYMENT_PAGE_UID'].filter(
        (name) => !isSet(env, name)
      );
      return missing.length ? `${missing.join(', ')} unset -> checkout is disabled.` : null;
    }
  },
  {
    feature: 'payments',
    off: (env) =>
      env.PAYPLUS_ENV === 'production'
        ? null
        : 'PAYPLUS_ENV is not "production" -> PayPlus sandbox (test money only).',
    prodOnly: true
  },
  {
    feature: 'payments',
    off: (env) =>
      isSet(env, 'API_PUBLIC_URL')
        ? null
        : 'API_PUBLIC_URL unset -> PayPlus has no callback URL; paid plans would not activate.',
    prodOnly: true
  },
  {
    feature: 'email',
    off: (env) => {
      if (isSet(env, 'SMTP_URL')) return null;
      if (isSet(env, 'EMAIL_API_KEY')) {
        return 'EMAIL_API_KEY is set without SMTP_URL -> that transport is not implemented; sending will fail.';
      }
      return 'SMTP_URL unset -> email is off (password reset, weekly summary, lifecycle emails).';
    }
  },
  {
    feature: 'links',
    off: (env) =>
      isSet(env, 'APP_URL')
        ? null
        : 'APP_URL unset -> links in emails/share pages point at http://localhost:5173.',
    prodOnly: true
  },
  {
    feature: 'share',
    off: (env) =>
      isSet(env, 'SHARE_BASE_URL')
        ? null
        : 'SHARE_BASE_URL unset -> share links use APP_URL/s/...; the frontend host must forward ^/s/ to this backend.'
  },
  {
    feature: 'supabase',
    off: (env) =>
      !supabaseConfigured(env) || isSet(env, 'SUPABASE_SERVICE_ROLE_KEY')
        ? null
        : 'SUPABASE_SERVICE_ROLE_KEY unset -> RLS-only tables (share_cards, whapi_*) use the anon key and will be refused.'
  },
  {
    feature: 'whatsapp-bot',
    off: (env) => {
      const missing = ['WHAPI_TOKEN', 'ANTHROPIC_API_KEY'].filter((name) => !isSet(env, name));
      return missing.length ? `${missing.join(', ')} unset -> Adi/Yoni WhatsApp replies are off.` : null;
    }
  },
  {
    feature: 'whatsapp-bot',
    off: (env) =>
      isSet(env, 'WHAPI_WEBHOOK_SECRET')
        ? null
        : 'WHAPI_WEBHOOK_SECRET unset -> the WHAPI webhook rejects every call in production.',
    prodOnly: true
  },
  {
    feature: 'whatsapp-inbox',
    off: (env) =>
      isSet(env, 'WHATSAPP_WEBHOOK_SECRET')
        ? null
        : 'WHATSAPP_WEBHOOK_SECRET unset -> /api/whatsapp webhook accepts any path secret.',
    prodOnly: true
  },
  {
    feature: 'error-tracking',
    off: (env) =>
      isSet(env, 'SENTRY_DSN')
        ? null
        : 'SENTRY_DSN unset -> server errors are only in the logs (no Sentry reports).',
    prodOnly: true
  },
  {
    feature: 'scheduler',
    off: (env) =>
      isSet(env, 'VERCEL')
        ? 'Running on Vercel -> the in-process weekly summary cron is not scheduled.'
        : null
  }
];

/**
 * Pure: inspects `env` and returns what is missing. Never returns values.
 * @returns {{ production: boolean, errors: string[], warnings: {feature: string, message: string}[] }}
 */
function checkConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const errors = REQUIRED.map((rule) => rule(env)).filter(Boolean);
  const warnings = [];
  for (const { feature, off, prodOnly } of OPTIONAL) {
    if (prodOnly && !production) continue;
    const message = off(env);
    if (message) warnings.push({ feature, message });
  }
  return { production, errors, warnings };
}

/**
 * Logs the report and, in production, throws when a required variable is
 * missing. Outside production missing "required" values are only warnings:
 * utils/auth.js generates a throwaway JWT secret and ALLOW_MEMORY_DB decides
 * the database, exactly as before.
 */
function runStartupConfigCheck(env = process.env, logger = defaultLogger) {
  const report = checkConfig(env);

  if (report.production && report.errors.length) {
    throw new Error(
      'Refusing to start: required configuration is missing in production:\n  - ' +
        report.errors.join('\n  - ')
    );
  }

  // Suites boot the server dozens of times; the report is noise there.
  if (env.NODE_ENV === 'test') return report;

  for (const message of report.errors) logger.warn(`[config] (required in production) ${message}`);
  for (const { feature, message } of report.warnings) logger.warn(`[config] ${feature}: ${message}`);
  if (!report.errors.length && !report.warnings.length) {
    logger.log('[config] all required and optional settings are present.');
  }
  return report;
}

module.exports = { checkConfig, runStartupConfigCheck };
