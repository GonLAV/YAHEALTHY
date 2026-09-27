/**
 * Google Calendar — the diagnostician's real calendar, read and written.
 *
 * Two calls, both against one calendar:
 *   - freeBusy: which times are already taken, by anything. A dentist
 *     appointment she put in by hand blocks a slot the same way a booking does,
 *     which is the whole point of syncing rather than keeping our own list.
 *   - createEvent: the booking itself, with a Google Meet link for an online
 *     diagnosis and the customer invited when they gave an email.
 *
 * Auth is OAuth with a refresh token for her Google account, not a service
 * account: a service account cannot create Meet links on a personal Gmail
 * calendar. scripts/google-auth.js produces the token once.
 *
 * Plain fetch rather than the googleapis package — two endpoints do not earn a
 * dependency that size, and Vercel pays for every megabyte on cold start.
 */
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

// An access token lives an hour. Kept for the life of the process, renewed a
// minute early so a request never goes out on one that expires mid-flight.
let cached = { token: null, expiresAt: 0 };

async function accessToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    // invalid_grant here means the refresh token was revoked or expired —
    // an unverified Google app's tokens expire after 7 days. The fix is to
    // run scripts/google-auth.js again, not anything in this file.
    throw new Error(`Google token refresh failed: ${body.error || response.status}`);
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
  return cached.token;
}

async function call(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Calendar ${method} failed: ${response.status} ${data.error?.message || ''}`.trim());
  }
  return data;
}

/**
 * Busy intervals between two instants, as [{start, end}] in epoch ms.
 */
async function freeBusy(timeMin, timeMax) {
  const data = await call('POST', `${API}/freeBusy`, {
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    items: [{ id: calendarId() }]
  });
  const calendar = data.calendars?.[calendarId()];
  if (calendar?.errors?.length) {
    // An unreadable calendar returns 200 with an error inside. Treating that
    // as "nothing busy" would offer every slot, including taken ones.
    throw new Error(`Google Calendar freeBusy: ${calendar.errors.map((e) => e.reason).join(', ')}`);
  }
  return (calendar?.busy || []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

/**
 * @returns {Promise<{id: string, htmlLink: string|null, meetLink: string|null}>}
 */
async function createEvent({ summary, description, start, end, timeZone, attendeeEmail, online, location }) {
  const event = {
    summary,
    description,
    start: { dateTime: new Date(start).toISOString(), timeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
    location: online ? undefined : location || undefined,
    conferenceData: online
      ? { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      : undefined
  };

  const params = new URLSearchParams({
    conferenceDataVersion: '1',
    // Google emails the invite, with the Meet link, only when asked to.
    sendUpdates: attendeeEmail ? 'all' : 'none'
  });
  const data = await call('POST', `${API}/calendars/${encodeURIComponent(calendarId())}/events?${params}`, event);

  const meetLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ||
    null;
  return { id: data.id, htmlLink: data.htmlLink || null, meetLink };
}

/**
 * Moves an existing event, and tells the invited customer. The Meet link, if
 * any, stays the same — it belongs to the event, not to its time.
 */
async function moveEvent(eventId, { start, end, timeZone }) {
  const url = `${API}/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  await call('PATCH', url, {
    start: { dateTime: new Date(start).toISOString(), timeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone }
  });
}

/**
 * Removes a booking from her calendar and tells the invited customer. An event
 * that is already gone (she deleted it by hand) counts as done.
 */
async function deleteEvent(eventId) {
  const url = `${API}/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  try {
    await call('DELETE', url);
  } catch (err) {
    if (/ (404|410) /.test(err.message)) return;
    throw err;
  }
}

module.exports = { isConfigured, freeBusy, createEvent, moveEvent, deleteEvent };
