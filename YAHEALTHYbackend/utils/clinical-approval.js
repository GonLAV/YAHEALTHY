/**
 * Clinical approval — turning "our dietitian approved this" into evidence.
 *
 * A prompt that tells a customer what to eat, and how many calories to aim
 * for, is clinical content. The defence for shipping it is that a registered
 * professional wrote and approved it. That defence is only worth something if
 * you can show WHICH text she approved and WHEN — and if the text that
 * actually answered a customer was that same text.
 *
 * So every approval here is bound to a sha256 of the exact prompt file. Edit
 * the prompt and the hash stops matching, which is the point: a change to
 * clinical content is a change that needs approving again, not a change that
 * slips through because the file was already on the approved list once.
 *
 * What this is not: it is not legal advice, and it is not a substitute for
 * the professional actually reading the text. It records a human decision. It
 * cannot make one.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'clinical-approvals.json');

function sha256OfFile(absolutePath) {
  const contents = fs.readFileSync(absolutePath);
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

/**
 * @returns {{persona: string, file: string, liveSha256: string, approved: boolean,
 *            approvedBy: string|null, approvedAt: string|null, reason: string|null}}
 */
function statusFor(persona, promptAbsolutePath) {
  const registry = loadRegistry();
  const entry = registry.prompts?.[persona];
  const liveSha256 = sha256OfFile(promptAbsolutePath);

  if (!entry) {
    return { persona, file: promptAbsolutePath, liveSha256, approved: false, approvedBy: null, approvedAt: null, reason: 'no registry entry for this persona' };
  }

  if (!entry.approvedSha256) {
    return { persona, file: entry.file, liveSha256, approved: false, approvedBy: entry.approvedBy ?? null, approvedAt: entry.approvedAt ?? null, reason: 'never approved' };
  }

  if (entry.approvedSha256 !== liveSha256) {
    return { persona, file: entry.file, liveSha256, approved: false, approvedBy: entry.approvedBy ?? null, approvedAt: entry.approvedAt ?? null, reason: 'the prompt has changed since it was approved' };
  }

  const approver = registry.approvers?.[entry.approvedBy];
  if (approver && approver.credentialVerified === false) {
    // Deliberately not fatal: whether a credential has been checked is an
    // administrative fact, and a professional does not stop being one because
    // a field is empty. It is surfaced so it does not stay empty forever.
    console.warn(
      `[clinical] ${persona} is approved by ${entry.approvedBy}, whose credential is recorded as unverified.`
    );
  }

  return { persona, file: entry.file, liveSha256, approved: true, approvedBy: entry.approvedBy, approvedAt: entry.approvedAt, reason: null };
}

/**
 * Check a persona's prompt at startup.
 *
 * Production refuses to start on an unapproved clinical prompt, for the same
 * reason it refuses to start without JWT_SECRET: the alternative is running
 * anyway and finding out later. The whole value of the approval is that
 * nothing answers a customer without it, and a check that can be ignored is
 * not a check.
 *
 * Development warns instead, so editing a prompt does not mean editing a JSON
 * file before you can test the edit.
 */
function assertApproved(persona, promptAbsolutePath) {
  const status = statusFor(persona, promptAbsolutePath);
  if (status.approved) return status;

  const message =
    `Clinical prompt "${persona}" is not approved: ${status.reason}. ` +
    `Live sha256 is ${status.liveSha256}. A registered professional has to read the ` +
    `current text and the approval recorded in data/clinical-approvals.json.`;

  if (IS_PRODUCTION) throw new Error(message);

  console.warn(`[clinical] ${message}`);
  return status;
}

/**
 * A short, stable label recorded next to every reply, so a conversation can
 * be read back against the exact rules that produced it. First 12 characters
 * of the hash: enough to identify a version, short enough to live in a column.
 */
function versionLabel(persona, promptAbsolutePath) {
  return `${persona}:${sha256OfFile(promptAbsolutePath).slice(0, 12)}`;
}

module.exports = {
  statusFor,
  assertApproved,
  versionLabel,
  sha256OfFile,
  loadRegistry,
  REGISTRY_PATH
};
