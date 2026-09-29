/**
 * Last-resort handlers for errors nothing else caught.
 *
 *   unhandledRejection  logged (and reported when SENTRY_DSN is set). The
 *                       process keeps running: a forgotten `.catch` on a
 *                       background promise should not take the API down.
 *   uncaughtException   logged and reported. In production the process then
 *                       exits(1) — its state is unknown after a throw nobody
 *                       caught — after it stops accepting connections and
 *                       gives in-flight reports up to 2s to leave. The host
 *                       (Docker restart policy, Vercel) starts a fresh one.
 *                       Outside production it stays up so nodemon/dev keeps
 *                       its state and the log shows the error.
 *
 * Installed once per process, however many times index.js is required.
 */

const logger = require('./logger');
const tracker = require('./error-tracker');

const INSTALLED = Symbol.for('yahealthy.processHandlers');

function installProcessHandlers({ getServer = () => null, exit = (code) => process.exit(code) } = {}) {
  if (process[INSTALLED]) return false;
  process[INSTALLED] = true;

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(`Non-error rejection: ${String(reason)}`);
    logger.error('unhandled promise rejection', { err });
    tracker.captureException(err, { kind: 'unhandledRejection' });
  });

  let exiting = false;
  process.on('uncaughtException', (err, origin) => {
    logger.error('uncaught exception', { err, origin });
    const report = tracker.captureException(err, { kind: 'uncaughtException', level: 'fatal' });

    if (process.env.NODE_ENV !== 'production' || exiting) return;
    exiting = true;
    logger.error('shutting down after an uncaught exception');

    const server = getServer();
    const done = () => {
      tracker.flush(2000).finally(() => exit(1));
    };
    // Hard stop even if connections refuse to drain.
    setTimeout(() => exit(1), 5000).unref();
    Promise.resolve(report).catch(() => {}).finally(() => {
      if (server && typeof server.close === 'function') {
        server.close(done);
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      } else {
        done();
      }
    });
  });

  return true;
}

module.exports = { installProcessHandlers };
