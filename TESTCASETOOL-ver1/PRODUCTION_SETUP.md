# Production Hardening Setup Guide

## What Was Added

This guide explains the three critical production-readiness improvements added to your Test Case Tool:

### 1. **Resilience Module** (`lib/resilience.ts`)
Automatic retry logic with exponential backoff for transient failures.

**Features**:
- Retries on rate limiting (429) and server errors (5xx)
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s (capped)
- Jitter to prevent thundering herd
- Timeout enforcement (60s per request)
- Circuit breaker to prevent cascading failures

**Usage**:
```typescript
import { withRetry, DEFAULT_RESILIENCE_CONFIG } from '@/lib/resilience';

// Automatic retry with backoff
const testPlans = await withRetry(
  (attempt) => client.getTestPlans(),
  'fetchTestPlans',
  DEFAULT_RESILIENCE_CONFIG
);
```

### 2. **Structured Logging** (`lib/structured-logger.ts`)
Production-grade logging with correlation IDs for tracing.

**Features**:
- Correlation ID generation and propagation
- JSON or text output formats
- Request duration tracking
- Log levels: info, warn, error, debug
- Structured error data

**Usage**:
```typescript
import { logger } from '@/lib/structured-logger';

logger.generateCorrelationId();
logger.info('Creating test case', { title: 'Test 1' });
logger.error('Failed to save', error);
```

### 3. **Comprehensive Testing** (`__tests__/`, `jest.config.js`, `.github/workflows/`)
Unit tests with automatic CI/CD pipeline.

**Features**:
- 30+ tests covering success and failure paths
- Jest + TypeScript support
- Code coverage tracking (70% threshold)
- GitHub Actions pipeline:
  - Linting and type checking
  - Unit tests with coverage
  - Production build verification
  - Security scanning (npm audit, OWASP)
  - Automated artifact packaging

---

## Installation

### Step 1: Install Dependencies

```bash
cd TESTCASETOOL-ver1
npm install
```

This adds:
- `jest` - Testing framework
- `ts-jest` - TypeScript support for Jest
- `@types/jest` - Type definitions
- `eslint` - Linting (for CI)

### Step 2: Verify Setup

```bash
# Check TypeScript
npx tsc --noEmit

# Run tests
npm test

# Check coverage
npm test:coverage

# Build for production
npm run build
```

---

## Configuration

### Environment Variables

Create `.env.local` in the project root:

```bash
# Resilience Configuration
RETRY_MAX_ATTEMPTS=5
RETRY_INITIAL_DELAY_MS=1000
RETRY_MAX_DELAY_MS=32000
REQUEST_TIMEOUT_MS=60000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=60000

# Logging Configuration
LOG_FORMAT=json  # 'json' or 'text' (default: text in dev, json in prod)
DEBUG=false      # Set to 'true' to enable debug logging
```

### Runtime Override

Environment variables override `.env.local`:

```bash
LOG_FORMAT=json npm run dev
REQUEST_TIMEOUT_MS=120000 npm test
```

---

## Usage Examples

### Example 1: Creating Test Case with Automatic Retry

```typescript
import { AzureDevOpsClient } from '@/lib/azure-devops';
import { logger } from '@/lib/structured-logger';

// Initialize logger
logger.generateCorrelationId();

// Create client
const client = new AzureDevOpsClient(config);

// Create test case (will retry on 429/5xx)
try {
  const result = await client.createTestCase({
    title: 'Login Test',
    description: 'Test user login flow',
    testSteps: [
      { action: 'Open login page', expectedResult: 'Form appears' },
      { action: 'Enter credentials', expectedResult: 'User logged in' },
    ],
    tags: ['smoke', 'critical'],
  });

  logger.info('Test case created', { id: result.id, title: result.title });
} catch (error) {
  logger.error('Failed to create test case', error);
}
```

### Example 2: Fetching with Structured Logging

```typescript
import { logger } from '@/lib/structured-logger';
import { withRetry } from '@/lib/resilience';

const startTime = Date.now();

try {
  const plans = await withRetry(
    (attempt) => {
      logger.debug(`Fetching test plans (attempt ${attempt})`);
      return client.getTestPlans();
    },
    'fetchTestPlans'
  );

  const duration = Date.now() - startTime;
  logger.info('Test plans fetched', { count: plans.length }, duration);
} catch (error) {
  const duration = Date.now() - startTime;
  logger.error('Failed to fetch test plans', error, duration);
}
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm test:coverage
```

Output: `coverage/` directory with HTML report

### Run Tests with CI Output

```bash
npm run test:ci
```

---

## Continuous Integration

### GitHub Actions Workflow

The `.github/workflows/ci-cd.yml` runs automatically on:
- ✅ Push to `main` or `develop` branches
- ✅ Pull requests to `main` or `develop` branches

**Stages**:

1. **Lint** (5min)
   - ESLint check
   - TypeScript compilation

2. **Test** (10min)
   - Jest unit tests
   - Code coverage upload to Codecov

3. **Build** (5min)
   - Next.js production build
   - Verify build succeeds

4. **Security** (5min)
   - npm audit (moderate severity)
   - OWASP Dependency Check

5. **Package** (5min) - *Only on main branch*
   - Create release artifact (`export.zip`)
   - Upload to GitHub Artifacts (30-day retention)

### Viewing Pipeline Status

```bash
# View recent runs
gh run list

# View specific run details
gh run view <RUN_ID>

# Download artifact
gh run download <RUN_ID> -n export
```

---

## Monitoring & Observability

### Log Output Examples

**Text Format** (default in dev):
```
[2025-12-10T15:30:45.123Z] [INFO] [1733859045123-a1b2c3d4e] Creating test case (5ms)
[2025-12-10T15:30:46.456Z] [ERROR] [1733859045123-a1b2c3d4e] Failed to save: 429 Too Many Requests
```

**JSON Format** (set `LOG_FORMAT=json`):
```json
{"correlationId":"1733859045123-a1b2c3d4e","timestamp":"2025-12-10T15:30:45.123Z","level":"info","message":"Creating test case","duration":5}
```

### Correlation ID Tracing

Use correlation IDs to trace a user action across multiple API calls:

```typescript
// Unique ID generated per user action
const correlationId = logger.generateCorrelationId();

// All subsequent logs include this ID
logger.info('Step 1');  // -> correlationId in log
logger.info('Step 2');  // -> same correlationId
```

### Performance Metrics

Monitor these metrics in production:

| Metric | Threshold | Action |
|--------|-----------|--------|
| API success rate | <99% | Investigate; check Azure DevOps status |
| P95 latency | >10s | Review retry config; might need to increase timeout |
| Retry rate | >5% | Azure DevOps might be rate limiting; adjust backoff |
| Circuit breaker trips | >1/day | Check Azure DevOps health; increase threshold if expected |

---

## Troubleshooting

### Tests Failing

```bash
# Check for missing env vars
echo $AZDO_PAT

# Run tests with debug output
DEBUG=true npm test

# Run specific test
npm test -- --testNamePattern="createTestCase"
```

### Build Failing

```bash
# Clean and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### CI/CD Pipeline Failing

1. Check GitHub Actions logs: `gh run view <RUN_ID>`
2. Common issues:
   - **npm install fails**: Check `package-lock.json` is committed
   - **Tests fail**: May be flaky; rerun job
   - **Build fails**: Check `npm run build` locally first

---

## Performance Tips

### Reduce API Calls

```typescript
// Cache GET requests
const cacheKey = `test-plans-${projectId}`;
const cached = sessionStorage.getItem(cacheKey);
if (cached) return JSON.parse(cached);

// Fetch
const plans = await client.getTestPlans();
sessionStorage.setItem(cacheKey, JSON.stringify(plans), 5 * 60 * 1000);
```

### Batch Operations

```typescript
// Instead of:
for (const tc of testCases) {
  await client.createTestCase(tc);  // Sequential, slow
}

// Use:
await Promise.all(
  testCases.map(tc => client.createTestCase(tc))  // Parallel
);
```

### Monitor Retry Behavior

```typescript
await withRetry(
  operation,
  'operationName',
  config,
  (attempt, delay, error) => {
    logger.warn(`Retry attempt ${attempt}`, { delay, error: error.message });
  }
);
```

---

## Next Steps

### Phase 2 Improvements (Optional)

1. **Add WIQL Paging** - Support large result sets
   ```typescript
   async queryWorkItems(wiql: string, skip: number, top: number) {
     // Implement $skip/$top paging
   }
   ```

2. **Add Request Caching** - Reduce redundant API calls
   ```typescript
   const cache = new Map<string, { data: any; expires: number }>();
   ```

3. **Centralized Logging** - Use Pino or Datadog for production
   ```typescript
   import pino from 'pino';
   const plogger = pino({ transport: { target: 'pino-datadog' } });
   ```

4. **Metrics Collection** - Track API performance
   ```typescript
   prometheus.recordDuration('api.request', duration);
   prometheus.recordCounter('api.errors', { status });
   ```

---

## Support

For issues or questions:

1. **Check logs** - Review correlation IDs in logs
2. **Run tests** - `npm test` to verify setup
3. **Check docs** - Review PRODUCTION_AUDIT.md for details
4. **GitHub Issues** - File issue with correlation ID from logs

---

## Summary

Your Test Case Tool now has:

- ✅ **Resilience**: Automatic retries with exponential backoff
- ✅ **Observability**: Structured logging with correlation IDs
- ✅ **Quality**: 30+ unit tests with 70% coverage target
- ✅ **CI/CD**: Automated GitHub Actions pipeline
- ✅ **Security**: npm audit and OWASP scanning

**Next**: Push to main branch and watch CI/CD pipeline run! 🚀
