/**
 * Prints the current sha256 of each clinical prompt, and whether it matches
 * what the registry says was approved.
 *
 * Run this after a professional has read and approved a new version, then
 * paste the hash into data/clinical-approvals.json along with who approved it
 * and when.
 *
 *   npm run approvals:hash
 */
const path = require('path');
const { statusFor, loadRegistry } = require('../utils/clinical-approval');

const registry = loadRegistry();
let anyUnapproved = false;

console.log('\nclinical prompt approvals\n');

for (const [persona, entry] of Object.entries(registry.prompts || {})) {
  const abs = path.join(__dirname, '..', entry.file);
  const s = statusFor(persona, abs);
  const mark = s.approved ? 'APPROVED' : 'NOT APPROVED';
  if (!s.approved) anyUnapproved = true;

  console.log(`  ${persona} (${entry.persona_he})  ${mark}`);
  console.log(`    file        ${entry.file}`);
  console.log(`    live sha256 ${s.liveSha256}`);
  if (s.approved) {
    console.log(`    approved by ${s.approvedBy} on ${s.approvedAt}`);
  } else {
    console.log(`    reason      ${s.reason}`);
    console.log(`    to approve  set approvedSha256 to the live hash above, with approvedBy and approvedAt`);
  }
  console.log('');
}

if (anyUnapproved) {
  console.log('At least one clinical prompt is unapproved. Production refuses to start in this state.\n');
  process.exit(1);
}
