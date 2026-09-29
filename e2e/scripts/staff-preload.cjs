/**
 * DEV-ONLY preload for scripts/screenshots.mjs (never used by the tests or in
 * production): `node -r <this> index.js` with SCREENSHOT_STAFF_EMAIL set and
 * ALLOW_MEMORY_DB=true makes that one in-memory user staff, so the real
 * /admin/marketing analytics render with real data. There is no public way to
 * mint a staff user, by design.
 */
const path = require('node:path');

const email = process.env.SCREENSHOT_STAFF_EMAIL;
if (email && process.env.ALLOW_MEMORY_DB === 'true') {
  const db = require(path.join(process.cwd(), 'utils', 'database'));
  const getUser = db.getUser;
  db.getUser = async (...args) => {
    const user = await getUser(...args);
    if (user && user.email === email) user.is_staff = true;
    return user;
  };
}
