/**
 * Connect the diagnostician's Google calendar — run once, on a laptop.
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.js
 *
 * Opens nothing by itself: it prints a link. She (or whoever holds her Google
 * login) opens it, approves calendar access, and the script prints the
 * GOOGLE_REFRESH_TOKEN to put in the server's environment. The token is shown
 * once and stored nowhere by this script.
 *
 * Prerequisite, in Google Cloud Console: an OAuth client of type "Desktop app",
 * the Google Calendar API enabled, and — while the app is in "Testing" — her
 * address added as a test user. A Testing app's refresh tokens expire after
 * 7 days; publish the consent screen to make it permanent.
 */
const http = require('http');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = Number(process.env.GOOGLE_AUTH_PORT) || 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// Events to create bookings, freebusy to read what is taken. Nothing wider.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy'
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.');
  process.exit(1);
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

  if (body.refresh_token) {
    console.log('\nGOOGLE_REFRESH_TOKEN=' + body.refresh_token + '\n');
  } else {
    console.error('No refresh token returned:', body);
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this link and approve calendar access:\n\n' + url + '\n');
});
