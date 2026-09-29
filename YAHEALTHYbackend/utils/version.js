/**
 * What is running: the package version and, when the platform provides it,
 * the git commit. Vercel sets VERCEL_GIT_COMMIT_SHA; other hosts can set
 * GIT_COMMIT_SHA at build/deploy time.
 */
const pkg = require('../package.json');

const commit = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '').trim() || null;

module.exports = {
  app: pkg.version,
  commit,
  commitShort: commit ? commit.slice(0, 7) : null,
  node: process.version
};
