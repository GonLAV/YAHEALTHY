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
    throw new Error(`WHAPI ${path} failed (${res.status}): ${message}`);
  }
  return data;
}

async function sendText(to, body) {
  return whapiFetch('/messages/text', {
    method: 'POST',
    body: JSON.stringify({ to, body })
  });
}

// Best-effort UX only (typing indicator) -- must never block a reply.
async function sendTyping(to) {
  try {
    await whapiFetch(`/presences/${encodeURIComponent(to)}`, {
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

// Configure the same value in the WHAPI dashboard's webhook custom headers
// (header name: X-Webhook-Secret) so incoming requests can be verified.
// If WHAPI_WEBHOOK_SECRET isn't set, verification is skipped -- fine for
// initial local testing, not for anything reachable from the internet.
function verifyWebhookSecret(req) {
  const expected = process.env.WHAPI_WEBHOOK_SECRET;
  if (!expected) return true;
  return req.get('x-webhook-secret') === expected;
}

module.exports = { sendText, sendTyping, downloadMediaAsBase64, verifyWebhookSecret };
