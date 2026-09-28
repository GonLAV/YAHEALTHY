/**
 * Find Playwright without making it a dependency of the app: a local install
 * if there is one, otherwise the globally installed package. Browsers come
 * from PLAYWRIGHT_BROWSERS_PATH (e.g. /opt/pw-browsers) — this never runs
 * `playwright install`. Returns null when Playwright is not available, so the
 * scripts that use it can skip instead of failing a build.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

export async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = ['playwright', 'playwright-core'];
  for (const name of candidates) {
    try {
      return require(name);
    } catch {
      /* not installed locally */
    }
  }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const globalRequire = createRequire(path.join(globalRoot, 'noop.js'));
    for (const name of candidates) {
      try {
        return globalRequire(name);
      } catch {
        /* not installed globally */
      }
    }
  } catch {
    /* npm unavailable */
  }
  return null;
}
