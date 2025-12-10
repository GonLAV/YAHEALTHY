/**
 * Developer Mode
 * Enhanced debugging, performance monitoring, and development utilities
 */

import { apiLogger } from './api-logger';

export interface DevModeMetrics {
  timestamp: Date;
  componentRenderTime: number;
  apiCallCount: number;
  totalApiTime: number;
  averageApiTime: number;
  memoryUsage?: number;
  localStorageUsage?: number;
}

export interface DeveloperModeConfig {
  enabled: boolean;
  logApiCalls: boolean;
  logComponentRenders: boolean;
  logLocalStorage: boolean;
  showPerformanceMetrics: boolean;
  showConsolePanel: boolean;
  enableNetworkThrottling: boolean;
  mockMode: boolean;
  hideProductionUI: boolean;
}

export class DeveloperMode {
  private static config: DeveloperModeConfig = {
    enabled: typeof window !== 'undefined' && localStorage.getItem('devMode') === 'true',
    logApiCalls: true,
    logComponentRenders: false,
    logLocalStorage: true,
    showPerformanceMetrics: true,
    showConsolePanel: true,
    enableNetworkThrottling: false,
    mockMode: false,
    hideProductionUI: false,
  };

  private static metrics: DevModeMetrics[] = [];
  private static componentRenderCount: number = 0;
  private static apiCallStartTime: number = 0;

  /**
   * Enable/Disable developer mode
   */
  static setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (typeof window !== 'undefined') {
      if (enabled) {
        localStorage.setItem('devMode', 'true');
        console.log('%c🔧 Developer Mode ENABLED', 'color: #3335FF; font-size: 14px; font-weight: bold;');
      } else {
        localStorage.removeItem('devMode');
        console.log('%c🔧 Developer Mode DISABLED', 'color: #666; font-size: 14px;');
      }
    }
  }

  /**
   * Check if developer mode is enabled
   */
  static isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current config
   */
  static getConfig(): DeveloperModeConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  static updateConfig(partial: Partial<DeveloperModeConfig>): void {
    this.config = { ...this.config, ...partial };
    console.log('Dev Mode Config Updated:', this.config);
  }

  /**
   * Log component render (call from React components)
   */
  static logComponentRender(componentName: string, props?: Record<string, any>): void {
    if (!this.config.enabled || !this.config.logComponentRenders) return;

    console.log(
      `%c⚛️  [RENDER] ${componentName}`,
      'color: #61dafb; font-weight: bold;',
      props || ''
    );

    this.componentRenderCount++;
  }

  /**
   * Log API call start
   */
  static startApiCall(method: string, url: string): void {
    if (!this.config.enabled || !this.config.logApiCalls) return;

    this.apiCallStartTime = performance.now();
    console.log(
      `%c📡 [API] ${method.toUpperCase()} ${url}`,
      'color: #00C2CC; font-weight: bold;'
    );
  }

  /**
   * Log API call end
   */
  static endApiCall(
    method: string,
    url: string,
    statusCode: number,
    responseTime: number
  ): void {
    if (!this.config.enabled || !this.config.logApiCalls) return;

    const color = statusCode < 400 ? '#4CAF50' : '#FF5722';
    const status = statusCode < 400 ? '✓' : '✗';

    console.log(
      `%c${status} [API] ${statusCode} ${responseTime}ms`,
      `color: ${color}; font-weight: bold;`
    );
  }

  /**
   * Log local storage operations
   */
  static logStorage(operation: 'set' | 'get' | 'remove', key: string, value?: any): void {
    if (!this.config.enabled || !this.config.logLocalStorage) return;

    const icon = operation === 'set' ? '💾' : operation === 'get' ? '📖' : '🗑️';
    console.log(
      `%c${icon} [STORAGE] ${operation.toUpperCase()} "${key}"`,
      'color: #FF9800; font-weight: bold;',
      value
    );
  }

  /**
   * Measure function execution time
   */
  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.config.enabled) return fn();

    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      console.log(
        `%c⏱️  [MEASURE] ${name}: ${duration.toFixed(2)}ms`,
        'color: #9C27B0; font-weight: bold;'
      );
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(
        `%c✗ [MEASURE] ${name}: ${duration.toFixed(2)}ms (ERROR)`,
        'color: #F44336; font-weight: bold;',
        error
      );
      throw error;
    }
  }

  /**
   * Measure synchronous function
   */
  static measure<T>(name: string, fn: () => T): T {
    if (!this.config.enabled) return fn();

    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      console.log(
        `%c⏱️  [MEASURE] ${name}: ${duration.toFixed(2)}ms`,
        'color: #9C27B0; font-weight: bold;'
      );
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(
        `%c✗ [MEASURE] ${name}: ${duration.toFixed(2)}ms (ERROR)`,
        'color: #F44336; font-weight: bold;',
        error
      );
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  static getMetrics(): DevModeMetrics {
    const apiStats = apiLogger.getSummary();

    const metric: DevModeMetrics = {
      timestamp: new Date(),
      componentRenderTime: this.componentRenderCount,
      apiCallCount: apiStats.totalRequests,
      totalApiTime: apiStats.totalResponseTime,
      averageApiTime: apiStats.totalRequests > 0
        ? apiStats.totalResponseTime / apiStats.totalRequests
        : 0,
    };

    if (typeof window !== 'undefined' && 'performance' in window) {
      metric.memoryUsage = (performance as any).memory?.usedJSHeapSize;
    }

    if (typeof localStorage !== 'undefined') {
      let storageSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          storageSize += localStorage[key].length + key.length;
        }
      }
      metric.localStorageUsage = storageSize;
    }

    this.metrics.push(metric);
    return metric;
  }

  /**
   * Get all stored metrics
   */
  static getAllMetrics(): DevModeMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics
   */
  static clearMetrics(): void {
    this.metrics = [];
    this.componentRenderCount = 0;
  }

  /**
   * Export diagnostics report
   */
  static exportDiagnostics(): string {
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      metrics: this.metrics,
      apiLogs: apiLogger.getLogs(),
      localStorage: typeof window !== 'undefined'
        ? Object.entries(localStorage).reduce((acc, [key, value]) => {
            acc[key] = value.substring(0, 100); // Truncate long values
            return acc;
          }, {} as Record<string, string>)
        : {},
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Print performance report to console
   */
  static printReport(): void {
    if (!this.config.enabled) return;

    const metrics = this.getMetrics();
    const apiStats = apiLogger.getSummary();

    console.group('%c📊 Developer Mode Report', 'color: #3335FF; font-size: 16px; font-weight: bold;');
    console.log('Timestamp:', metrics.timestamp.toLocaleString());
    console.log('Component Renders:', metrics.componentRenderTime);
    console.log('API Calls:', metrics.apiCallCount);
    console.log('Total API Time:', `${metrics.totalApiTime.toFixed(2)}ms`);
    console.log('Average API Time:', `${metrics.averageApiTime.toFixed(2)}ms`);
    console.log('API Success Rate:', `${(apiStats.successRate * 100).toFixed(1)}%`);
    console.log('API Error Rate:', `${((1 - apiStats.successRate) * 100).toFixed(1)}%`);

    if (metrics.memoryUsage) {
      console.log('Memory Usage:', `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    }

    if (metrics.localStorageUsage) {
      console.log('LocalStorage Usage:', `${(metrics.localStorageUsage / 1024).toFixed(2)}KB`);
    }

    console.groupEnd();
  }

  /**
   * Mock API responses (for development)
   */
  static createMockResponse<T>(data: T, delay: number = 500): Promise<T> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('%c🎭 [MOCK] Returning mock data', 'color: #FF6D00; font-weight: bold;', data);
        resolve(data);
      }, delay);
    });
  }

  /**
   * Inject test data into application
   */
  static injectTestData(testCases: any[]): void {
    if (!this.config.enabled) {
      console.warn('Dev Mode must be enabled to inject test data');
      return;
    }

    console.log(
      `%c💉 [TEST DATA] Injecting ${testCases.length} test cases`,
      'color: #E91E63; font-weight: bold;'
    );

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('devTestData', JSON.stringify(testCases));
    }
  }

  /**
   * Get injected test data
   */
  static getTestData(): any[] {
    if (typeof localStorage === 'undefined') return [];

    const data = localStorage.getItem('devTestData');
    return data ? JSON.parse(data) : [];
  }

  /**
   * Clear all dev data and settings
   */
  static clearAll(): void {
    this.metrics = [];
    this.componentRenderCount = 0;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('devMode');
      localStorage.removeItem('devTestData');
    }

    console.log('%c🧹 Developer Mode data cleared', 'color: #666; font-weight: bold;');
  }

  /**
   * Log version information
   */
  static logVersionInfo(appVersion: string): void {
    if (!this.config.enabled) return;

    console.group('%c📦 Version Information', 'color: #00C2CC; font-weight: bold;');
    console.log('App Version:', appVersion);
    console.log('Browser:', navigator.userAgent);
    console.log('Language:', navigator.language);
    console.log('Screen:', `${window.innerWidth}x${window.innerHeight}`);
    console.groupEnd();
  }
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).__DEV__ = {
    DeveloperMode,
    enable: () => DeveloperMode.setEnabled(true),
    disable: () => DeveloperMode.setEnabled(false),
    config: () => console.log(DeveloperMode.getConfig()),
    metrics: () => console.log(DeveloperMode.getMetrics()),
    report: () => DeveloperMode.printReport(),
    export: () => console.log(DeveloperMode.exportDiagnostics()),
    clear: () => DeveloperMode.clearAll(),
  };
}
