/**
 * Boots the stack for the smoke tests and returns the teardown.
 *
 *   backend  YAHEALTHYbackend/index.js on a free port, ALLOW_MEMORY_DB=true
 *   frontend Vite dev server on a free port, proxying /api and /s/ to it
 *
 * Both are spawned in their own process group and only those groups are
 * killed afterwards — nothing else on the machine is touched. The frontend
 * origin is handed to the tests through E2E_BASE_URL.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const backendDir = path.join(repo, 'YAHEALTHYbackend');
const frontendDir = path.join(repo, 'YAHEALTHYFrontend');
const logDir = path.join(here, 'test-results');

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
    if (child.exitCode !== null) throw new Error(`${name} exited early (code ${child.exitCode}); see ${logDir}/${name}.log`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} did not answer ${url} within ${timeoutMs} ms; see ${logDir}/${name}.log`);
}

function start(name, cmd, args, { cwd, env }) {
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, `${name}.log`), 'w');
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
    detached: true // own process group, so teardown can take Vite's esbuild child too
  });
  return child;
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

export default async function globalSetup() {
  for (const dir of [backendDir, frontendDir]) {
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      throw new Error(`${dir}/node_modules is missing — run npm install there first`);
    }
  }

  const apiPort = await freePort();
  const webPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;

  const backend = start('backend', process.execPath, ['index.js'], {
    cwd: backendDir,
    env: {
      PORT: String(apiPort),
      NODE_ENV: 'development',
      ALLOW_MEMORY_DB: 'true',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      JWT_SECRET: 'e2e-only-secret-not-for-production',
      CORS_ORIGINS: webUrl,
      APP_URL: webUrl,
      SHARE_BASE_URL: webUrl,
      // Every test signs up (and each page load hits /api/auth/me) from one IP.
      AUTH_RATE_LIMIT_MAX: '1000'
    }
  });

  const stack = { backend, frontend: null };
  const teardown = async () => {
    stop(stack.frontend);
    stop(stack.backend);
  };

  try {
    await waitFor(`${apiUrl}/api/health`, backend, 'backend');

    stack.frontend = start(
      'frontend',
      process.execPath,
      [path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'],
      { cwd: frontendDir, env: { VITE_PROXY_TARGET: apiUrl, VITE_API_URL: '' } }
    );
    await waitFor(`${webUrl}/api/health`, stack.frontend, 'frontend');
    await waitFor(webUrl, stack.frontend, 'frontend');
  } catch (error) {
    await teardown();
    throw error;
  }

  process.env.E2E_BASE_URL = webUrl;
  process.env.E2E_API_URL = apiUrl;
  return teardown;
}
