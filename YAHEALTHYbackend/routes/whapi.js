/**
 * WHAPI webhook -- receives WhatsApp messages, routes them to Mor or the
 * chef, and sends the reply back. See docs/bot/nuri-bot-prompt.md and
 * docs/bot/chef-bot-prompt.md for what each persona actually does; this file
 * is only transport and routing.
 *
 * The 'nuri' identifier below is the internal DB value (whapi_conversations
 * .active_bot, constrained by migrations/001) -- renaming it would need a
 * migration for no user-visible benefit. "Mor" is the persona's name in
 * every user-facing string; SWITCH_COMMANDS is what a customer types.
 */
const express = require('express');
const { waitUntil } = require('@vercel/functions');
const db = require('../utils/database');
const whapi = require('../utils/whapi');
const brain = require('../utils/whapi-brain');

const router = express.Router();

const SWITCH_COMMANDS = { 'שף': 'chef', chef: 'chef', 'מור': 'nuri', mor: 'nuri' };

// The one and only place an emoji is allowed -- every reply Mor herself
// writes is plain text, enforced in the prompt (docs/bot/nuri-bot-prompt.md).
const WELCOME = `שלום! \u{1F642} זאת מור.

שלחו תמונת תווית או כל שאלה על אוכל. רוצים את השף (מתכונים, בישול) -- כתבו "שף". לחזור אליי -- "מור".`;

// WHAPI's dispatcher appends the event type to the configured webhook URL
// (confirmed by inspecting a raw delivery: a webhook set to base "/x" arrives
// at "/x/messages" for message events) -- so this route is "/messages", not
// "/webhook". The mismatch was silent: our catch-all Vercel rewrite still
// invoked the function, Express just had no matching route, so it 404'd with
// nothing logged anywhere WHAPI's side surfaces to us.
router.post('/messages', async (req, res) => {
  if (!whapi.verifyWebhookSecret(req)) {
    return res.status(401).json({ error: 'invalid webhook secret' });
  }

  // Ack immediately -- WHAPI expects a fast response and appears to give up
  // silently if the Claude round trip (2-20+s) makes it wait (confirmed: a
  // real incoming message never got a reply even though a direct POST to
  // this same handler worked). But a plain "respond then keep running"
  // doesn't work on Vercel either: the execution environment is frozen right
  // after the response is sent, so unfinished work after res.json() was
  // silently dropped (confirmed too -- nothing ever reached the DB). Ack
  // fast, then hand the rest to waitUntil so Vercel keeps the function alive
  // until it's actually done.
  res.status(200).json({ received: true });

  const messages = req.body?.messages || [];
  waitUntil((async () => {
    for (const message of messages) {
      try {
        await handleIncomingMessage(message);
      } catch (err) {
        console.error('[whapi] failed to handle message:', message?.id, err);
      }
    }
  })());
});

async function handleIncomingMessage(message) {
  if (message.from_me) return; // never react to our own outgoing messages
  if (!['text', 'image'].includes(message.type)) return; // v1 scope

  const phone = message.chat_id || message.from;
  if (!phone) return;

  const existingConversation = await db.getWhapiConversation(phone);
  const isNewConversation = !existingConversation;
  const conversation = existingConversation || (await db.upsertWhapiConversation(phone, 'nuri'));

  const rawText = (message.text?.body || message.image?.caption || '').trim();
  const switchTo = SWITCH_COMMANDS[rawText.toLowerCase()];
  if (switchTo) {
    await db.upsertWhapiConversation(phone, switchTo);
    await whapi.sendText(
      phone,
      switchTo === 'chef' ? 'עברנו לשף. מה מבשלים היום?' : 'עברנו למור. שלחו תמונת תווית או שאלת מזון.'
    );
    return;
  }

  if (isNewConversation) {
    await whapi.sendText(phone, WELCOME);
  }

  let imageBase64 = null;
  let imageMediaType = null;
  if (message.type === 'image' && message.image?.link) {
    try {
      const media = await whapi.downloadMediaAsBase64(message.image.link);
      imageBase64 = media.base64;
      imageMediaType = media.mimeType;
    } catch (err) {
      console.error('[whapi] failed to download image:', err);
      await whapi.sendText(phone, 'לא הצלחתי לפתוח את התמונה — אפשר לשלוח שוב?');
      return;
    }
  }

  if (!rawText && !imageBase64) return; // nothing usable to respond to

  await whapi.sendTyping(phone);

  const history = await db.getRecentWhapiMessages(phone, 20);
  const reply = await brain.generateReply({
    activeBot: conversation.active_bot,
    history,
    userText: rawText,
    imageBase64,
    imageMediaType
  });

  await db.logWhapiMessage(phone, 'user', rawText || '[תמונה]');
  await db.logWhapiMessage(phone, 'assistant', reply);
  await whapi.sendText(phone, reply);
}

module.exports = router;
