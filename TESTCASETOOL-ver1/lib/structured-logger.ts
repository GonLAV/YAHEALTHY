/**
 * Structured Logging Module with Correlation IDs
 * Enables tracing of requests across the entire stack
 */

export interface LogContext {
  correlationId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
  duration?: number;
}

export class StructuredLogger {
  private correlationId: string = '';
  private isJsonOutput: boolean = true;

  constructor(isJsonOutput: boolean = true) {
    this.isJsonOutput = isJsonOutput;
  }

  /**
   * Set correlation ID for tracing
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Generate unique correlation ID
   */
  generateCorrelationId(): string {
    this.correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return this.correlationId;
  }

  private formatLog(context: LogContext): string {
    if (this.isJsonOutput) {
      return JSON.stringify(context);
    }

    const prefix = `[${context.timestamp}] [${context.level.toUpperCase()}] [${context.correlationId}]`;
    const suffix = context.duration ? ` (${context.duration}ms)` : '';
    const dataStr = context.data ? `\n${JSON.stringify(context.data, null, 2)}` : '';
    return `${prefix} ${context.message}${suffix}${dataStr}`;
  }

  /**
   * Log with context
   */
  private log(level: LogContext['level'], message: string, data?: any, duration?: number): void {
    const context: LogContext = {
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      duration,
    };

    const output = this.formatLog(context);
    
    switch (level) {
      case 'info':
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
      case 'debug':
        if (process.env.DEBUG) {
          console.debug(output);
        }
        break;
    }
  }

  info(message: string, data?: any, duration?: number): void {
    this.log('info', message, data, duration);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: any, duration?: number): void {
    const errorData = error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
        }
      : error;

    this.log('error', message, errorData, duration);
  }

  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }
}

// Global logger instance
export const logger = new StructuredLogger(process.env.LOG_FORMAT === 'json');
