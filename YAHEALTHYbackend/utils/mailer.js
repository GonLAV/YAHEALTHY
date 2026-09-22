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
 * Deliberately unimplemented: choosing between SMTP, Resend, SendGrid and the
 * rest is a decision with cost and deliverability attached, and guessing here
 * would mean writing an integration against an account that does not exist.
 * The shape is fixed so the rest of the code can be written against it now.
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

  throw new Error(
    'An email provider is configured but no transport is implemented yet. ' +
    'Fill in deliver() in utils/mailer.js for the provider you chose.'
  );
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
