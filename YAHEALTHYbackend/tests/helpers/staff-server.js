/**
 * The real app, fronted by two routes that exist only for
 * tests/staff-access.test.js.
 *
 * Staff rights are granted by hand in SQL in production, on purpose: an
 * endpoint that hands them out is another route to the same messages. So the
 * test needs a way in that the product does not have, and it lives here rather
 * than behind a flag inside the application — a test-only path in the app is a
 * test-only path in production too.
 *
 * The test routes are mounted in FRONT of the real app rather than appended to
 * it, because index.js ends with a 404 handler and anything registered after
 * that is unreachable.
 */

const express = require('express');
const db = require('../../utils/database');
const auth = require('../../utils/auth');

const PORT = Number(process.env.PORT);

async function main() {
  // Seed before the app loads, so the listing has something to return.
  await db.saveWhatsappMessage({
    id: 'test-msg-1',
    chat_id: '972500000001@s.whatsapp.net',
    from_number: '972500000001',
    from_name: 'בדיקה',
    from_me: false,
    type: 'text',
    body: 'שלום, שאלה על אוכל',
    sent_at: new Date().toISOString(),
    status: 'pending',
    raw: { secret: 'this must never be returned by the API' }
  });

  await db.saveWhatsappMessage({
    id: 'test-msg-2',
    chat_id: '972500000002@s.whatsapp.net',
    from_number: '972500000002',
    from_name: 'בדיקה',
    from_me: false,
    type: 'text',
    body: 'אני בהריון ורוצה לרדת במשקל',
    sent_at: new Date().toISOString(),
    status: 'escalated',
    raw: { secret: 'this must never be returned by the API' }
  });

  // VERCEL stops index.js binding a port of its own; the wrapper binds instead.
  process.env.VERCEL = '1';
  const realApp = require('../../index.js');

  const wrapper = express();
  wrapper.use(express.json());

  wrapper.post('/api/test-only/grant-staff', auth.authMiddleware, async (req, res) => {
    // In memory mode this is the stored object itself, which is as close as a
    // test can get to the UPDATE a person would run in production.
    const user = await db.getUser(req.user.userId);
    if (!user) return res.status(404).json({ error: 'no user' });
    user.is_staff = true;
    return res.json({ ok: true });
  });

  wrapper.get('/api/test-only/subscription-check', auth.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    await db.createSubscription(userId, 'base');

    // Holding the returned rows is enough to move the end date around without
    // opening a back door into the data layer.
    const held = await db.getActiveSubscriptions(userId);
    const openEnded = held.length;

    const day = 86400000;
    held.forEach((row) => { row.ends_at = new Date(Date.now() - day).toISOString(); });
    const afterExpiry = (await db.getActiveSubscriptions(userId)).length;

    held.forEach((row) => { row.ends_at = new Date(Date.now() + day).toISOString(); });
    const futureEnd = (await db.getActiveSubscriptions(userId)).length;

    return res.json({ openEnded, afterExpiry, futureEnd });
  });

  wrapper.use(realApp);
  wrapper.listen(PORT, () => console.log(`test server on ${PORT}`));
}

main().catch((error) => {
  console.error('test server failed to start:', error);
  process.exit(1);
});
