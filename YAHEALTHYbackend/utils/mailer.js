/**
 * Outbound email.
 *
 * There is no email provider chosen for this project yet, and the password
 * reset flow was papering over that by returning the reset token in the API
 * response whenever NODE_ENV was not 'production'. That made an unauthenticated
 * request for someone else's email address return a working reset link for
 * their account, with a single environment variable standing between that and
 * production.
 *
 * So the seam lives here instead. Development prints the link to the server
 * log, which only someone who already has the server has. Production refuses
 * to send unless a provider is configured, rather than quietly dropping mail
 * that a person is waiting for. When a provider is picked, `deliver` is the
 * one function that needs filling in.
 */

const nodemailer = require('nodemailer');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Where the links in these emails point. The reset link is useless if it
// points at the API instead of the app the person is looking at.
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

function providerConfigured() {
  return Boolean(process.env.SMTP_URL || process.env.EMAIL_API_KEY);
}

/**
 * Hand a message to the configured provider.
 *
 * Gmail SMTP was chosen for this project: set SMTP_URL to a connection string
 * like smtps://user%40gmail.com:app-password@smtp.gmail.com:465 (needs a Gmail
 * App Password). Development with no provider prints the message to the
 * server log; production refuses to pretend a message was sent.
 */
async function deliver({ to, subject, text }) {
  if (!providerConfigured()) {
    if (IS_PRODUCTION) {
      // Fail loudly. A reset email that silently never arrives looks to the
      // person like the account is broken, and they have no way to tell.
      throw new Error(
        'No email provider configured. Set SMTP_URL or EMAIL_API_KEY. ' +
        'Refusing to pretend a message was sent.'
      );
    }

    console.info(
      `\n[mail] would send to ${to}\n[mail] subject: ${subject}\n[mail] ${text}\n`
    );
    return { delivered: false, logged: true };
  }

  if (!process.env.SMTP_URL) {
    throw new Error(
      'EMAIL_API_KEY is set but that provider transport is not implemented. ' +
      'Configure SMTP_URL to send mail.'
    );
  }

  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  const from = process.env.SMTP_FROM ||
    decodeURIComponent(new URL(process.env.SMTP_URL).username);
  await transport.sendMail({ from: `YAHEALTHY <${from}>`, to, subject, text });
  return { delivered: true };
}

async function sendPasswordResetEmail(to, resetToken) {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

  return deliver({
    to,
    subject: 'איפוס הסיסמה שלך ב-YAHEALTHY',
    text:
      `קיבלנו בקשה לאפס את הסיסמה שלך.\n\n${link}\n\n` +
      'הקישור תקף לשעה אחת וניתן לשימוש פעם אחת בלבד. ' +
      'אם לא ביקשת לאפס סיסמה, אפשר להתעלם מההודעה הזו — לא בוצע שום שינוי.'
  });
}

module.exports = {
  deliver,
  sendPasswordResetEmail,
  providerConfigured,
  APP_URL
};
