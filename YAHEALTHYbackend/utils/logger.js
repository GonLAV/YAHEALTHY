/**
 * Structured logging, with no dependency.
 *
 *   const logger = require('./utils/logger');
 *   logger.info('lead stored', { source: 'landing' });
 *   logger.error('share read failed', err);            // an Error as the 2nd argument
 *   const log = logger.child({ requestId: req.id });   // bindings on every line
 *
 * Output
 *   - production (or LOG_FORMAT=json): one JSON object per line —
 *     {"time","level","msg",...fields}. Vercel and most log drains parse it.
 *   - otherwise (or LOG_FORMAT=pretty): `HH:MM:SS.mmm WARN  msg key=value`.
 *   error/warn go to stderr, info/debug to stdout.
 *
 * Levels: debug < info < warn < error. LOG_LEVEL picks the minimum
 * (default info; warn under NODE_ENV=test so suites stay quiet).
 *
 * Redaction happens here, on every line, so a call site cannot forget it:
 *   - values under keys that name a secret (password, token, authorization,
 *     cookie, api key, secret, signature, dsn, ...) become "[REDACTED]";
 *   - in any string: e-mail addresses are masked (j***@example.com), phone
 *     numbers keep only their last two digits, "Bearer ..." and JWT-shaped
 *     strings are replaced, and /s/<token> share paths lose the token.
 * `redact()` is exported so other modules (client error intake, the Sentry
 * reporter) apply the same rules.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

// Keys whose values are never logged, at any depth. Matched on the key name
// with separators removed, so apiKey / api_key / API-KEY all match.
const SECRET_KEY = /(pass(word|wd)?|secret|token|authorization|auth|cookie|apikey|privatekey|signature|dsn|jwt|session|otp|code_?verifier|creditcard|cardnumber|cvv|key$)/i;
// Keys that hold personal data outright.
const PII_KEY = /^(email|emailaddress|phone|phonenumber|mobile|fromnumber|tonumber|chatid|address|ip|ipaddress|fullname|firstname|lastname|username)$/i;

const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
// An optional +, then 9-15 digits possibly split by spaces, dots or dashes.
const PHONE_RE = /(?<![\w/])\+?\d(?:[\s.-]?\d){8,14}(?![\w])/g;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const SHARE_PATH_RE = /\/s\/(?!:)[^/\s?#"']+/g;
const QUERY_SECRET_RE = /([?&](?:token|t|key|code|secret|signature|sig|access_token|auth)=)[^&\s#"']+/gi;

function maskPhone(match) {
  const digits = match.replace(/\D/g, '');
  return `***${digits.slice(-2)}`;
}

/** Scrubs personal data and credentials out of free text. */
function redactString(value) {
  if (typeof value !== 'string' || !value) return value;
  return value
    .replace(BEARER_RE, '$1 [REDACTED]')
    .replace(JWT_RE, '[REDACTED_JWT]')
    .replace(SHARE_PATH_RE, '/s/[REDACTED]')
    .replace(QUERY_SECRET_RE, '$1[REDACTED]')
    .replace(EMAIL_RE, '$1***@$2')
    .replace(PHONE_RE, maskPhone);
}

function serializeError(err, depth) {
  const out = {
    type: err.name || 'Error',
    message: redactString(String(err.message || ''))
  };
  if (err.code !== undefined) out.code = redact(err.code, depth + 1);
  if (Number.isInteger(err.status)) out.status = err.status;
  if (err.stack) out.stack = redactString(String(err.stack)).split('\n').slice(0, 15).join('\n');
  if (err.cause && depth < 3) out.cause = redact(err.cause, depth + 1);
  return out;
}

/**
 * Deep copy of `value` with secrets removed and personal data masked.
 * Cycles and very deep objects are cut rather than followed.
 */
function redact(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Error) return serializeError(value, depth);
  if (value instanceof Date) return value.toISOString();
  if (depth > 6) return '[Truncated]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((v) => redact(v, depth + 1, seen));
    if (value.length > 50) items.push(`[+${value.length - 50} more]`);
    return items;
  }

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    const bare = key.replace(/[-_\s]/g, '');
    if (SECRET_KEY.test(bare)) out[key] = v === undefined || v === null || v === '' ? v : '[REDACTED]';
    else if (PII_KEY.test(bare) && typeof v === 'string') out[key] = v ? maskValue(v) : v;
    else out[key] = redact(v, depth + 1, seen);
  }
  return out;
}

function maskValue(v) {
  const scrubbed = redactString(v);
  if (scrubbed !== v) return scrubbed;
  return v.length <= 2 ? '***' : `${v[0]}***`;
}

// ─── output ─────────────────────────────────────────────────────────────────

function resolveFormat(env = process.env) {
  const configured = String(env.LOG_FORMAT || '').toLowerCase();
  if (configured === 'json' || configured === 'pretty') return configured;
  return env.NODE_ENV === 'production' ? 'json' : 'pretty';
}

function resolveLevel(env = process.env) {
  const configured = String(env.LOG_LEVEL || '').toLowerCase();
  if (LEVELS[configured]) return configured;
  return env.NODE_ENV === 'test' ? 'warn' : 'info';
}

function prettyValue(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return /\s/.test(v) ? JSON.stringify(v) : v;
  return JSON.stringify(v);
}

function formatPretty(entry) {
  const { time, level, msg, err, ...rest } = entry;
  const clock = time.slice(11, 23);
  const fields = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${prettyValue(v)}`)
    .join(' ');
  let line = `${clock} ${level.toUpperCase().padEnd(5)} ${msg}${fields ? ` ${fields}` : ''}`;
  if (err) {
    line += `\n  ${err.type}: ${err.message}`;
    if (err.stack) line += `\n${err.stack.split('\n').slice(1).map((l) => `  ${l.trim()}`).join('\n')}`;
  }
  return line;
}

function defaultSink(level, line) {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

let sink = defaultSink;

/**
 * Builds a logger. `bindings` are merged into every line (a child adds its
 * own). Settings are read per call, so tests can change LOG_LEVEL/LOG_FORMAT.
 */
function createLogger(bindings = {}) {
  function write(level, msg, fields) {
    if (LEVELS[level] < LEVELS[resolveLevel()]) return;

    let extra = fields;
    if (extra instanceof Error) extra = { err: extra };
    else if (extra !== undefined && (typeof extra !== 'object' || extra === null || Array.isArray(extra))) {
      extra = { detail: extra };
    }

    const entry = {
      time: new Date().toISOString(),
      level,
      msg: redactString(typeof msg === 'string' ? msg : String(msg)),
      ...redact({ ...bindings, ...(extra || {}) })
    };

    let line;
    try {
      line = resolveFormat() === 'json' ? JSON.stringify(entry) : formatPretty(entry);
    } catch {
      line = JSON.stringify({ time: entry.time, level, msg: entry.msg, note: 'fields not serialisable' });
    }
    try {
      sink(level, line, entry);
    } catch {
      /* logging must never throw into the caller */
    }
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    // console-compatible alias, so `logger` can stand in where console was injected.
    log: (msg, fields) => write('info', msg, fields),
    child: (more = {}) => createLogger({ ...bindings, ...more }),
    bindings: () => ({ ...bindings })
  };
}

const logger = createLogger();

module.exports = logger;
module.exports.createLogger = createLogger;
module.exports.redact = redact;
module.exports.redactString = redactString;
module.exports.LEVELS = LEVELS;
/** Tests: capture lines instead of writing them. Returns a restore function. */
module.exports.setSink = (fn) => {
  const previous = sink;
  sink = typeof fn === 'function' ? fn : defaultSink;
  return () => {
    sink = previous;
  };
};
/** The request's child logger (set by middleware/requestContext), or a fallback with its id. */
module.exports.forRequest = (req) =>
  (req && req.log) || logger.child(req && req.id ? { requestId: req.id } : {});
