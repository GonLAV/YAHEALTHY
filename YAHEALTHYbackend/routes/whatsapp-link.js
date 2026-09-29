/**
 * Connect WhatsApp to the account — the app side of the link.
 *
 *   GET    /api/whatsapp/link            status for the signed-in user
 *   POST   /api/whatsapp/link/code       one-time code (+ wa.me link with it pre-filled)
 *   DELETE /api/whatsapp/link            unlink (also cancels any unanswered "לרשום ביומן?")
 *
 * Every route acts on req.user only — there is no user id in any path or
 * body, so there is nothing to point at someone else's link. The phone side
 * (the code arriving in the chat) is utils/whatsapp-food-log.handleLinkCode.
 */

const express = require('express');
const auth = require('../utils/auth');
const flow = require('../utils/whatsapp-food-log');
const { buildWaLink, linkMessageText } = require('../utils/whatsapp-logging');
const { formatPhoneForDisplay } = require('../utils/phone');
const { forRequest: reqLog } = require('../utils/logger');

const router = express.Router();

/** 050-***-4567: enough for the owner to recognise, not the whole number on screen. */
function maskedDisplay(phone) {
  const shown = formatPhoneForDisplay(phone);
  if (!shown) return null;
  return `${shown.slice(0, 3)}-***-${shown.slice(-4)}`;
}

function botNumber() {
  const digits = String(process.env.WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '');
  return digits || null;
}

router.get('/', auth.authMiddleware, async (req, res) => {
  try {
    const status = await flow.linkStatus(req.user.userId);
    const bot = botNumber();
    return res.json({
      linked: status.linked,
      phone: status.linked ? maskedDisplay(status.phone) : null,
      linkedAt: status.linked ? status.linkedAt : null,
      botNumber: bot ? `+${bot}` : null
    });
  } catch (error) {
    reqLog(req).error('whatsapp link status failed', { err: error });
    return res.status(500).json({ error: 'Failed to load WhatsApp status', requestId: req.id });
  }
});

router.post('/code', auth.authMiddleware, async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'he';
  try {
    const issued = await flow.issueCode(req.user.userId);
    if (issued.error === 'rate_limited') {
      return res.status(429).json({ error: 'Too many codes — try again later', requestId: req.id });
    }
    const bot = botNumber();
    return res.status(201).json({
      code: issued.code,
      expiresAt: issued.expiresAt,
      message: linkMessageText(issued.code, lang),
      waLink: buildWaLink(bot, issued.code, lang),
      botNumber: bot ? `+${bot}` : null
    });
  } catch (error) {
    reqLog(req).error('whatsapp link code failed', { err: error });
    return res.status(500).json({ error: 'Failed to create a link code', requestId: req.id });
  }
});

router.delete('/', auth.authMiddleware, async (req, res) => {
  try {
    await flow.unlink(req.user.userId);
    return res.json({ linked: false });
  } catch (error) {
    reqLog(req).error('whatsapp unlink failed', { err: error });
    return res.status(500).json({ error: 'Failed to disconnect WhatsApp', requestId: req.id });
  }
});

module.exports = router;
