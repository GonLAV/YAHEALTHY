/**
 * Connect the diagnostician's Google calendar — run once, on a laptop.
 *
 *   node scripts/google-auth.js --client-id <ID> --client-secret <SECRET> --save
 *
 * Prints a link. Whoever holds her Google login opens it and approves calendar
 * access. With --save, the three GOOGLE_* values are written into
 * YAHEALTHYbackend/.env (git-ignored) and nothing secret is printed; without
 * it, the refresh token is printed once, to paste into Vercel by hand. The
 * same values go into Vercel's environment for production either way.
 *
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in the environment work too, in
 * place of the flags.
 *
 * Prerequisite, in Google Cloud Console: an OAuth client of type "Desktop app",
 * the Google Calendar API enabled, and — while the app is in "Testing" — her
 * address added as a test user. A Testing app's refresh tokens expire after
 * 7 days; publish the consent screen to make it permanent.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const CLIENT_ID = flag('client-id') || process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = flag('client-secret') || process.env.GOOGLE_CLIENT_SECRET;
const SAVE = argv.includes('--save');
const ENV_FILE = path.join(__dirname, '..', '.env');
const PORT = Number(process.env.GOOGLE_AUTH_PORT) || 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// Events to create bookings, freebusy to read what is taken. Nothing wider.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy'
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node scripts/google-auth.js --client-id <ID> --client-secret <SECRET> [--save]');
  process.exit(1);
}

/** Set or replace KEY=value lines in .env, leaving every other line as it was. */
function saveToEnv(values) {
  const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const nl = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing ? existing.split(/\r?\n/) : [];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [key, value] of Object.entries(values)) {
    const i = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (i === -1) lines.push(`${key}=${value}`);
    else lines[i] = `${key}=${value}`;
  }
  fs.writeFileSync(ENV_FILE, lines.join(nl) + nl);
}

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPES.join(' '),
  // offline + consent is what makes Google return a refresh token at all.
  access_type: 'offline',
  prompt: 'consent'
}).toString();

const server = http.createServer(async (req, res) => {
  const incoming = new URL(req.url, REDIRECT);
  if (incoming.pathname !== '/callback') return res.writeHead(404).end();

  const code = incoming.searchParams.get('code');
  if (!code) {
    res.end('No code in the reply — access was probably declined.');
    console.error('Declined:', incoming.searchParams.get('error'));
    return server.close();
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code'
    })
  });
  const body = await response.json();
  res.end(body.refresh_token ? 'Connected. You can close this tab.' : 'Something went wrong — see the terminal.');

  if (!body.refresh_token) {
    console.error('No refresh token returned:', body.error || body);
  } else if (SAVE) {
    saveToEnv({
      GOOGLE_CLIENT_ID: CLIENT_ID,
      GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN: body.refresh_token,
      GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || 'primary'
    });
    console.log(`\nConnected. GOOGLE_* saved to ${ENV_FILE} — add the same values to Vercel for production.\n`);
  } else {
    console.log('\nGOOGLE_REFRESH_TOKEN=' + body.refresh_token + '\n');
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this link and approve calendar access:\n\n' + url + '\n');
});
