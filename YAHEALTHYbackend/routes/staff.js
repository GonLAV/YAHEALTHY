/**
 * Staff — the appointments screen.
 *
 * Mounted behind authMiddleware and requireStaff in index.js. These rows carry
 * names, phone numbers and sometimes a health note, which is exactly the data
 * requireStaff exists to keep from a signed-up stranger.
 *
 *   GET  /api/staff/appointments?scope=upcoming|attention|recent
 *   POST /api/staff/appointments/:id/cancel    frees the slot, removes the event
 *   POST /api/staff/appointments/:id/resolve   clears needs_attention
 *   GET  /api/staff/escalations                WhatsApp messages that tripped a health flag
 *   POST /api/staff/escalations/:id/handled    a person has dealt with one
 *   GET  /api/staff/payments                   payments that need a person (migrations/015)
 *   POST /api/staff/payments/:uid/resolve      a person has settled one
 */
const express = require('express');
const db = require('../utils/database');
const appointments = require('../utils/appointments');

const router = express.Router();
const SCOPES = ['upcoming', 'attention', 'recent'];

router.get('/appointments', async (req, res) => {
  const scope = SCOPES.includes(req.query.scope) ? req.query.scope : 'upcoming';
  try {
    const rows = await db.listAppointmentsForStaff(scope);
    return res.json({ scope, appointments: rows.map(appointments.staffView) });
  } catch (error) {
    console.error('[staff] could not list appointments:', error.message);
    return res.status(500).json({ error: 'Could not list appointments', requestId: req.id });
  }
});

router.post('/appointments/:id/cancel', async (req, res) => {
  try {
    const result = await appointments.cancel(req.params.id, { by: 'staff' });
    if (!result.ok) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.json({ appointment: appointments.staffView(result.row) });
  } catch (error) {
    console.error('[staff] cancel failed:', error.message);
    return res.status(500).json({ error: 'Could not cancel', requestId: req.id });
  }
});

router.post('/appointments/:id/resolve', async (req, res) => {
  try {
    const row = await db.updateAppointment(req.params.id, { needs_attention: null });
    if (!row) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.json({ appointment: appointments.staffView(row) });
  } catch (error) {
    return res.status(500).json({ error: 'Could not update', requestId: req.id });
  }
});

// The bots tell someone who mentions a pregnancy, diabetes or an allergy that
// a professional will look at it. This is where the professional looks.
router.get('/escalations', async (req, res) => {
  try {
    const messages = await db.getWhatsappMessages({ status: 'escalated', limit: 200 });
    return res.json({
      messages: messages.map((m) => ({
        id: m.id,
        phone: m.chat_id,
        name: m.from_name || null,
        body: m.body,
        receivedAt: m.received_at || m.sent_at || null
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Could not list escalations', requestId: req.id });
  }
});

router.post('/escalations/:id/handled', async (req, res) => {
  try {
    const row = await db.setWhatsappMessageStatus(req.params.id, 'answered');
    if (!row) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Could not update', requestId: req.id });
  }
});

// Money that arrived and could not be matched to what it paid for. Before
// migrations/015 these lived in a server log and nowhere else.
router.get('/payments', async (req, res) => {
  try {
    const rows = await db.listFlaggedPaymentEvents();
    return res.json({
      payments: rows.map((r) => ({
        uid: r.page_request_uid,
        email: r.email,
        plan: r.plan,
        status: r.status,
        amount: r.amount,
        currency: r.currency,
        needsAttention: r.needs_attention,
        receivedAt: r.received_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Could not list payments', requestId: req.id });
  }
});

router.post('/payments/:uid/resolve', async (req, res) => {
  try {
    const row = await db.resolvePaymentEvent(req.params.uid);
    if (!row) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Could not update', requestId: req.id });
  }
});

module.exports = router;
