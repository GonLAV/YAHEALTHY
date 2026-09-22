/**
 * Client for WHAPI.Cloud (https://whapi.cloud) -- the WhatsApp gateway that
 * carries messages for Nuri and the chef. One channel/token = one phone
 * number; routing between the two bot personas happens in routes/whapi.js,
 * not here.
 */
const WHAPI_API_URL = (process.env.WHAPI_API_URL || 'https://gate.whapi.cloud').replace(/\/+$/, '');
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;

async function whapiFetch(path, options = {}) {
  if (!WHAPI_TOKEN) {
    throw new Error('WHAPI_TOKEN is not set -- cannot talk to WHAPI.');
  }

  const attemptOnce = async () => {
    const res = await fetch(`${WHAPI_API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message || res.statusText;
      const err = new Error(`WHAPI ${path} failed (${res.status}): ${message}`);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  // One retry with a short backoff on a transient failure: a network-level
  // error (fetch itself threw -- DNS, timeout, connection reset) or a 5xx
  // from WHAPI. Not for 4xx -- a bad request or bad auth fails the exact
  // same way again immediately, so retrying it only adds latency. This bot's
  // whole pitch is feeling like texting a real person, so one dropped
  // connection shouldn't be the difference between a reply and silence.
  try {
    return await attemptOnce();
  } catch (err) {
    if (err.status && err.status < 500) throw err;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return attemptOnce();
  }
}

async function sendText(to, body) {
  return whapiFetch('/messages/text', {
    method: 'POST',
    body: JSON.stringify({ to, body })
  });
}

// Best-effort UX only (typing indicator) -- must never block a reply.
//
// /presences/{id} wants a bare phone number, not the chat_id shape
// ("<phone>@s.whatsapp.net") that /messages/text accepts for `to` -- passing
// the full chat_id here always got a 400 ("EntryID must match exactly one
// schema in oneOf"), silently, forever, since every call caught its own
// error. Confirmed by hitting the endpoint directly with each shape.
async function sendTyping(to) {
  try {
    const bareNumber = String(to).split('@')[0];
    await whapiFetch(`/presences/${encodeURIComponent(bareNumber)}`, {
      method: 'PUT',
      body: JSON.stringify({ presence: 'typing' })
    });
  } catch (err) {
    console.warn('[whapi] typing indicator failed (non-fatal):', err.message);
  }
}

async function downloadMediaAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download WhatsApp media (${res.status})`);
  }
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString('base64'), mimeType };
}

// The WHAPI channel already sends this header (configured once via WHAPI's
// API, matching whatever value WHAPI_WEBHOOK_SECRET holds here).
//
// Fails CLOSED in production without WHAPI_WEBHOOK_SECRET set: this route
// is reachable from the internet, and was confirmed unauthenticated in
// production for a period -- any caller could forge messages into a real
// customer's conversation (message.chat_id/from are taken straight from
// the request body) or make the bot send real WhatsApp messages from the
// business number to any number of their choosing. Only skipped when
// NODE_ENV isn't 'production' (same signal utils/database.js's own
// IS_PRODUCTION check already relies on), so local dev needs no new setup.
//
// Deploy note: do not ship this without WHAPI_WEBHOOK_SECRET actually set
// in Vercel's production environment variables first -- until it is,
// NODE_ENV is 'production' there, so this fails every request, including
// WHAPI's real ones.
function verifyWebhookSecret(req) {
  const expected = process.env.WHAPI_WEBHOOK_SECRET;
  if (expected) return req.get('x-webhook-secret') === expected;
  return process.env.NODE_ENV !== 'production';
}

module.exports = { sendText, sendTyping, downloadMediaAsBase64, verifyWebhookSecret };
