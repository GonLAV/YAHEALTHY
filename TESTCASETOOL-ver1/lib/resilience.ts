/**
 * Resilience Module - Retry, Timeout, and Error Handling
 * Implements exponential backoff with jitter for transient failures
 */

export interface ResilienceConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  timeoutMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  jitterFactor: 0.1,
  timeoutMs: 60000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
};

/**
 * Calculate exponential backoff with jitter
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: ResilienceConfig
): number {
  const exponentialDelay = Math.min(
    config.initialDelayMs * Math.pow(2, attemptNumber - 1),
    config.maxDelayMs
  );

  // Add jitter: ±10% of delay
  const jitter = exponentialDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(exponentialDelay + jitter, 0);
}

/**
 * Check if error is retryable (429, 5xx)
 */
export function isRetryableError(error: any): boolean {
  const status = error?.response?.status || error?.status;
  // Retry on 429 (rate limit), 500-599 (server errors)
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by failing fast after threshold is exceeded
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number,
    private resetTimeMs: number
  ) {}

  /**
   * Check if circuit is open (rejecting requests)
   */
  isOpen(): boolean {
    if (this.state === 'CLOSED') return false;

    if (this.state === 'OPEN') {
      // Check if reset time has passed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.resetTimeMs) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record a failure
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Record a success
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  /**
   * Get current state
   */
  getState(): string {
    return this.state;
  }
}

/**
 * Timeout wrapper with AbortController
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  operation: (attemptNumber: number) => Promise<T>,
  operationName: string,
  config: ResilienceConfig = DEFAULT_RESILIENCE_CONFIG,
  onRetry?: (attempt: number, delay: number, error: any) => void
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await withTimeout(
        operation(attempt),
        config.timeoutMs,
        operationName
      );
    } catch (error) {
      lastError = error;

      if (attempt === config.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config);
      onRetry?.(attempt, delay, error);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
