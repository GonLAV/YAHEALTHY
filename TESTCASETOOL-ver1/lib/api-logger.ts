/**
 * API Request/Response Logger
 * Logs raw API requests, parsed request bodies, and Azure responses
 * Helps debug issues with blank test cases or field mismatches
 */

export interface ApiLogEntry {
  timestamp: string;
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  requestBody?: any;
  requestBodyJson?: string;
  responseStatus?: number;
  responseBody?: any;
  error?: string;
  duration?: number;
}

class ApiLogger {
  private logs: ApiLogEntry[] = [];
  private maxLogs: number = 500; // Keep last 500 entries
  private isEnabled: boolean = true;

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`[ApiLogger] Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Log API request start
   */
  logRequest(
    method: string,
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): ApiLogEntry {
    if (!this.isEnabled) return {} as ApiLogEntry;

    const entry: ApiLogEntry = {
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      headers: this.sanitizeHeaders(headers),
      requestBody: body,
      requestBodyJson: body ? JSON.stringify(body, null, 2) : undefined,
    };

    console.group(
      `[API Request] ${method} ${endpoint} - ${entry.timestamp}`
    );
    console.log('Headers:', entry.headers);
    if (body) {
      console.log('Body:', entry.requestBodyJson);
    }
    console.groupEnd();

    this.logs.push(entry);
    this.pruneOldLogs();

    return entry;
  }

  /**
   * Log API response
   */
  logResponse(
    endpoint: string,
    status: number,
    data?: any,
    duration?: number
  ): void {
    if (!this.isEnabled) return;

    const lastRequest = this.logs.find((log) => log.endpoint === endpoint);
    if (lastRequest) {
      lastRequest.responseStatus = status;
      lastRequest.responseBody = data;
      lastRequest.duration = duration;
    }

    console.group(
      `[API Response] ${endpoint} - Status: ${status} (${duration || 0}ms)`
    );
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
    console.groupEnd();
  }

  /**
   * Log API error
   */
  logError(endpoint: string, error: any, duration?: number): void {
    if (!this.isEnabled) return;

    const lastRequest = this.logs.find((log) => log.endpoint === endpoint);
    if (lastRequest) {
      lastRequest.error = error?.message || JSON.stringify(error);
      lastRequest.duration = duration;
    }

    console.group(`[API Error] ${endpoint}`);
    console.error('Error:', error);
    if (error?.response?.data) {
      console.error('Response Data:', error.response.data);
    }
    console.groupEnd();
  }

  /**
   * Log JSON Patch validation
   */
  logPatchValidation(
    endpoint: string,
    operations: any[],
    validationResult?: { valid: boolean; errors: string[] }
  ): void {
    if (!this.isEnabled) return;

    console.group(`[JSON Patch Validation] ${endpoint}`);
    console.log('Operations:', JSON.stringify(operations, null, 2));
    if (validationResult) {
      console.log('Valid:', validationResult.valid);
      if (validationResult.errors.length > 0) {
        console.warn('Errors:', validationResult.errors);
      }
    }
    console.groupEnd();
  }

  /**
   * Get all logs
   */
  getLogs(): ApiLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs for specific endpoint
   */
  getLogsForEndpoint(endpoint: string): ApiLogEntry[] {
    return this.logs.filter((log) => log.endpoint.includes(endpoint));
  }

  /**
   * Get last N logs
   */
  getLastLogs(count: number = 10): ApiLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    console.log(`[ApiLogger] Cleared ${this.logs.length} entries`);
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  exportAsJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Export logs as CSV
   */
  exportAsCsv(): string {
    if (this.logs.length === 0) return '';

    const headers = [
      'Timestamp',
      'Method',
      'Endpoint',
      'Status',
      'Duration (ms)',
      'Error',
    ];
    const rows = this.logs.map((log) => [
      log.timestamp,
      log.method,
      log.endpoint,
      log.responseStatus || 'N/A',
      log.duration || 'N/A',
      log.error || 'N/A',
    ]);

    const csvContent = [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    errorRate: number;
  } {
    const total = this.logs.length;
    const successful = this.logs.filter((log) => log.responseStatus && log.responseStatus < 400).length;
    const failed = total - successful;
    const avgDuration =
      this.logs.reduce((sum, log) => sum + (log.duration || 0), 0) / Math.max(total, 1);
    const errorRate = (failed / Math.max(total, 1)) * 100;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      averageResponseTime: Math.round(avgDuration),
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  /**
   * Sanitize headers to hide sensitive data (PAT tokens)
   */
  private sanitizeHeaders(
    headers?: Record<string, string>
  ): Record<string, string> | undefined {
    if (!headers) return undefined;

    const sanitized = { ...headers };
    if (sanitized['Authorization']) {
      sanitized['Authorization'] = 'Basic [REDACTED]';
    }
    return sanitized;
  }

  /**
   * Remove old logs if exceeds max
   */
  private pruneOldLogs(): void {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }
}

// Export singleton instance
export const apiLogger = new ApiLogger();

/**
 * Helper function to measure and log API calls with timing
 */
export async function measureApiCall<T>(
  method: string,
  endpoint: string,
  apiCall: () => Promise<T>,
  requestBody?: any,
  headers?: Record<string, string>
): Promise<T> {
  const startTime = performance.now();
  apiLogger.logRequest(method, endpoint, requestBody, headers);

  try {
    const result = await apiCall();
    const duration = performance.now() - startTime;

    if (result && typeof result === 'object' && 'status' in result) {
      const response = result as any;
      apiLogger.logResponse(endpoint, response.status, response.data, duration);
    }

    return result;
  } catch (error: any) {
    const duration = performance.now() - startTime;
    const status = error?.response?.status || 500;
    apiLogger.logError(endpoint, error, duration);

    if (error?.response?.status) {
      apiLogger.logResponse(endpoint, error.response.status, error.response.data, duration);
    }

    throw error;
  }
}
