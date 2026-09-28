#!/usr/bin/env node
/**
 * Visual QA: full-page screenshots of every page, Hebrew + English, mobile
 * (390×844) + desktop (1440×900). NOT part of `npm test`.
 *
 *   cd e2e && node scripts/screenshots.mjs [outDir] [--only=<substring>]
 *
 * Boots the stack like global-setup.mjs (backend with ALLOW_MEMORY_DB=true +
 * Vite, free ports, own process groups, only those are killed), seeds three
 * users (one signup each: the auth limiter is 50 / 15 min per IP):
 *   main  — onboarded, a week of food / water / sleep / weight logs, a share link
 *   fresh — onboarded but empty (empty states), then walks the wizard
 *   staff — made staff by scripts/staff-preload.cjs (dev-only), for /admin/marketing
 * Each browser context sends its own X-Forwarded-For (the backend trusts one
 * proxy hop) so the per-IP API limiter is not exhausted by one run.
 *
 * Output: <outDir>/<lang>-<viewport>/<name>.png (default outDir:
 * e2e/screenshots/latest, gitignored) plus <outDir>/report.json with every
 * page's horizontal-overflow measurement and the offending elements.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}
const { chromium } = await import('@playwright/test');

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(here, '..');
const repo = path.resolve(e2eDir, '..');
const backendDir = path.join(repo, 'YAHEALTHYbackend');
const frontendDir = path.join(repo, 'YAHEALTHYFrontend');
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(e2eDir, 'screenshots', 'latest'));
const logDir = path.join(outDir, 'logs');
fs.mkdirSync(logDir, { recursive: true });

const PASSWORD = 'correct horse battery staple';
const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
};
const LANGS = ['he', 'en'];
const L = {
  he: { share: 'שיתוף השבוע שלי', more: 'עוד', next: 'הבא' },
  en: { share: 'Share my week', more: 'More', next: 'Next' }
};

// ── stack ────────────────────────────────────────────────────────────────────
async function freePort() {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const { port } = srv.address();
  srv.close();
  await once(srv, 'close');
  return port;
}

async function waitFor(url, child, name, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${name} exited early; see ${logDir}/${name}.log`);
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} did not answer ${url}`);
}

function start(name, cmd, cmdArgs, { cwd, env }) {
  const log = fs.openSync(path.join(logDir, `${name}.log`), 'w');
  return spawn(cmd, cmdArgs, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', log, log], detached: true });
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } }
}

const stamp = Date.now();
const emails = {
  main: `shots-main-${stamp}@example.com`,
  fresh: `shots-fresh-${stamp}@example.com`,
  staff: `shots-staff-${stamp}@example.com`
};

const apiPort = await freePort();
const webPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const stack = {};
const teardown = () => { stop(stack.frontend); stop(stack.backend); };
process.on('SIGINT', () => { teardown(); process.exit(130); });

let ipSeq = 10;
const nextIp = () => `10.77.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

async function call(method, route, { token, data, ip = '10.77.250.1' } = {}) {
  const res = await fetch(`${apiUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {})
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (res.status >= 400) throw new Error(`${method} ${route} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const isoDaysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
};

async function seedMain(token) {
  await call('PUT', '/api/users/me/preferences', {
    token,
    data: {
      preferences: {
        onboarding: {
          goal: 'lose_weight',
          profile: { sex: 'female', age: 34, heightCm: 165, weightKg: 72, targetWeightKg: 66, activityLevel: 'light' }
        },
        dietary: { vegetarian: false, vegan: false, kosher: true, gluten_free: false, lactose_free: false, allergies: '' },
        reminders: { whatsapp: false, email: true },
        waterTargetLiters: 2.5,
        sleepTargetHours: 8
      }
    }
  });
  const meals = [
    ['breakfast', 'שקשוקה עם לחם מחמצת וסלט ישראלי קצוץ', 520, 24, 48, 26],
    ['lunch', 'Grilled chicken breast with quinoa, roasted vegetables and tahini', 640, 48, 55, 22],
    ['snack', 'יוגורט יווני עם גרנולה ותותים', 260, 18, 30, 7],
    ['dinner', 'סלמון אפוי עם בטטה ואספרגוס', 590, 38, 42, 27]
  ];
  for (let d = 6; d >= 0; d--) {
    const date = isoDaysAgo(d);
    for (const [mealType, name, calories, p, c, f] of meals.slice(0, d === 0 ? 3 : 4)) {
      await call('POST', '/api/food-logs', {
        token,
        data: { date, name, mealType, calories: calories + d * 7, proteinGrams: p, carbsGrams: c, fatGrams: f }
      });
    }
    for (let g = 0; g < (d % 3 === 0 ? 6 : 9); g++) {
      await call('POST', '/api/hydration-logs', { token, data: { date, litersConsumed: 0.25, source: 'water' } });
    }
    await call('POST', '/api/sleep-logs', {
      token,
      data: { date, sleepHours: [7.5, 6.2, 8.1, 7, 5.8, 8.4, 7.3][d], sleepQuality: ['good', 'fair', 'excellent', 'good', 'poor', 'excellent', 'good'][d] }
    });
  }
  const goal = await call('POST', '/api/weight-goals', { token, data: { startWeightKg: 72, targetWeightKg: 66 } });
  for (const weightKg of [72, 71.6, 71.4, 70.9]) {
    await call('POST', '/api/weight-logs', { token, data: { goalId: goal.id, weightKg } });
  }
}

// ── capture helpers ──────────────────────────────────────────────────────────
const report = [];

async function settle(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* long-poll etc. */ }
  await page.waitForTimeout(1200); // recharts / transitions
}

async function measure(page) {
  // Mobile emulation widens the layout viewport (innerWidth) to fit wide
  // content, so compare against the configured width, not innerWidth.
  const configured = page.viewportSize().width;
  return page.evaluate((vw) => {
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        // Only report elements whose parent is inside, i.e. the outermost culprit.
        const p = el.parentElement.getBoundingClientRect();
        if (p.right <= vw + 1 && p.left >= -1) {
          offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 40)}"`);
        }
      }
    }
    const scrollWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    return { scrollWidth, innerWidth: vw, offenders: offenders.slice(0, 12) };
  }, configured);
}

async function shot(page, dir, name, { fullPage = true } = {}) {
  if (only && !`${dir}/${name}`.includes(only)) return;
  await settle(page);
  // content-visibility:auto sections are skipped in a full-page capture.
  await page.addStyleTag({ content: '.below-fold{content-visibility:visible!important}' });
  const m = await measure(page);
  const file = path.join(outDir, dir, `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage });
  report.push({ shot: `${dir}/${name}.png`, url: page.url(), ...m });
  const flag = m.scrollWidth > m.innerWidth ? `  OVERFLOW ${m.scrollWidth}>${m.innerWidth}` : '';
  console.log(`${dir}/${name}${flag}`);
}

async function newPage(browser, { lang, vp, token }) {
  const context = await browser.newContext({
    ...VIEWPORTS[vp],
    locale: lang === 'he' ? 'he-IL' : 'en-US',
    timezoneId: 'Asia/Jerusalem',
    extraHTTPHeaders: { 'X-Forwarded-For': nextIp() }
  });
  await context.addInitScript(([l, tk]) => {
    try {
      if (!sessionStorage.getItem('shots-primed')) {
        localStorage.setItem('yahealthy-lang', l);
        if (tk) localStorage.setItem('token', tk);
        // Keep the PWA install prompt from covering pages.
        localStorage.setItem('yahealthy-install-dismissed', '1');
        sessionStorage.setItem('shots-primed', '1');
      }
    } catch { /* storage unavailable */ }
  }, [lang, token || null]);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${lang}/${vp}] ${e.message}`));
  return { context, page };
}

// ── main ─────────────────────────────────────────────────────────────────────
try {
  stack.backend = start('backend', process.execPath, ['-r', path.join(here, 'staff-preload.cjs'), 'index.js'], {
    cwd: backendDir,
    env: {
      PORT: String(apiPort),
      NODE_ENV: 'development',
      ALLOW_MEMORY_DB: 'true',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      JWT_SECRET: 'screenshots-only-secret',
      CORS_ORIGINS: webUrl,
      APP_URL: webUrl,
      SHARE_BASE_URL: webUrl,
      LIFECYCLE_ENABLED: 'false',
      SCREENSHOT_STAFF_EMAIL: emails.staff
    }
  });
  await waitFor(`${apiUrl}/api/health`, stack.backend, 'backend');
  stack.frontend = start(
    'frontend',
    process.execPath,
    [path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'],
    { cwd: frontendDir, env: { VITE_PROXY_TARGET: apiUrl, VITE_API_URL: '' } }
  );
  await waitFor(`${webUrl}/api/health`, stack.frontend, 'frontend');
  await waitFor(webUrl, stack.frontend, 'frontend');

  // Seed: three signups total.
  const users = {};
  for (const [key, name] of [['main', 'Noa Cohen'], ['fresh', 'Avi'], ['staff', 'Staff Member']]) {
    const body = await call('POST', '/api/auth/signup', { data: { email: emails[key], password: PASSWORD, name } });
    users[key] = body.token;
    await call('POST', '/api/onboarding', { token: body.token, data: {} });
  }
  await seedMain(users.main);
  const shareLinks = {};
  for (const lang of LANGS) {
    const link = await call('POST', '/api/share/weekly-card/link', {
      token: users.main,
      data: { lang, tz: 'Asia/Jerusalem', showName: true, includeWeight: true }
    });
    shareLinks[lang] = link.url;
  }
  console.log('seeded', Object.keys(users).join(', '));

  const browser = await chromium.launch();
  // Each language's own public URLs (/en/* switches the app to English).
  const publicPages = (lang) => {
    const prefix = lang === 'en' ? '/en' : '';
    return [
      ['login', '/login'],
      ['signup', '/signup'],
      ['landing', prefix || '/'],
      ['guides', `${prefix}/guides`],
      ['guide', `${prefix}/guides/how-much-water`]
    ];
  };
  const privatePages = [
    ['dashboard', '/dashboard'],
    ['food-log', '/food-log'],
    ['hydration', '/hydration'],
    ['sleep', '/sleep'],
    ['weight', '/weight'],
    ['coaching', '/coaching'],
    ['progress', '/progress'],
    ['achievements', '/achievements'],
    ['invite', '/invite'],
    ['settings', '/settings']
  ];

  for (const lang of LANGS) {
    for (const vp of Object.keys(VIEWPORTS)) {
      const dir = `${lang}-${vp}`;

      // Public pages (signed out).
      {
        const { context, page } = await newPage(browser, { lang, vp });
        for (const [name, url] of publicPages(lang)) {
          await page.goto(`${webUrl}${url}`);
          await shot(page, dir, `public-${name}`);
        }
        await page.goto(shareLinks[lang]);
        await shot(page, dir, 'share-public-page');
        await context.close();
      }

      // Main user with a week of data.
      {
        const { context, page } = await newPage(browser, { lang, vp, token: users.main });
        for (const [name, url] of privatePages) {
          await page.goto(`${webUrl}${url}`);
          await shot(page, dir, name);
        }
        await page.goto(`${webUrl}/dashboard`);
        await settle(page);
        await page.getByRole('button', { name: L[lang].share }).first().click();
        await page.getByRole('dialog').locator('figure img').waitFor({ timeout: 10_000 }).catch(() => {});
        await shot(page, dir, 'share-modal', { fullPage: false });
        await page.keyboard.press('Escape');
        if (vp === 'mobile') {
          await page.getByRole('button', { name: L[lang].more, exact: true }).click();
          await shot(page, dir, 'more-sheet', { fullPage: false });
          await page.keyboard.press('Escape');
        }
        await context.close();
      }

      // Staff analytics.
      {
        const { context, page } = await newPage(browser, { lang, vp, token: users.staff });
        await page.goto(`${webUrl}/admin/marketing`);
        await shot(page, dir, 'admin-marketing');
        await context.close();
      }

      // Brand-new (empty) user, then the onboarding wizard.
      {
        const { context, page } = await newPage(browser, { lang, vp, token: users.fresh });
        for (const [name, url] of privatePages.filter(([n]) => !['invite', 'settings', 'coaching'].includes(n))) {
          await page.goto(`${webUrl}${url}`);
          await shot(page, dir, `empty-${name}`);
        }
        await page.goto(`${webUrl}/onboarding`);
        const next = page.locator('main button[type="submit"]');
        await shot(page, dir, 'onboarding-1-goal');
        await page.locator('input[name="goal"][value="lose_weight"]').check();
        await next.click();
        await page.locator('input[name="sex"][value="female"]').check();
        await page.locator('#onb-age').fill('34');
        await page.locator('#onb-height').fill('165');
        await page.locator('#onb-weight').fill('72');
        await page.locator('#onb-target').fill('66');
        await page.locator('#onb-activity').selectOption('light');
        await shot(page, dir, 'onboarding-2-body');
        await next.click();
        await shot(page, dir, 'onboarding-3-diet');
        await next.click();
        await shot(page, dir, 'onboarding-4-targets');
        await next.click();
        await shot(page, dir, 'onboarding-5-reminders');
        // Only the last pass saves, so earlier passes keep the empty states.
        if (lang === LANGS.at(-1) && vp === 'desktop') {
          await next.click();
          await shot(page, dir, 'onboarding-6-first-win');
        }
        await context.close();
      }
    }
  }
  // The first-win step, in the other combinations, without saving again:
  // re-walk on a finished user is allowed; the step only appears after save,
  // so it is captured once above.
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  const overflow = report.filter((r) => r.scrollWidth > r.innerWidth);
  console.log(`\n${report.length} screenshots in ${outDir}; ${overflow.length} with horizontal overflow`);
  for (const o of overflow) console.log(` - ${o.shot}: ${o.scrollWidth}>${o.innerWidth}\n    ${o.offenders.join('\n    ')}`);
} finally {
  teardown();
}
