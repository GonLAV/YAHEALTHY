/**
 * Flaky Test Detector
 * Identifies unreliable tests based on execution history and patterns
 */

export interface TestExecution {
  testCaseId: number;
  timestamp: Date;
  status: 'passed' | 'failed' | 'skipped' | 'blocked';
  duration: number; // milliseconds
  errorMessage?: string;
  environmentInfo?: {
    browser?: string;
    os?: string;
    version?: string;
  };
  runId?: string;
}

export interface FlakinessAnalysis {
  testCaseId: number;
  testCaseName: string;
  totalRuns: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  blockCount: number;
  passRate: number; // 0-100
  flakinessScore: number; // 0-100 (higher = flakier)
  flakinessCategory: 'stable' | 'occasionally-flaky' | 'flaky' | 'very-flaky';
  confidence: number; // 0-100 based on sample size
  commonFailures: string[];
  environmentCorrelation?: string; // Browser, OS, version that causes failures
  trend: 'improving' | 'degrading' | 'stable';
  recommendations: string[];
  lastRun?: TestExecution;
}

export class FlakyTestDetector {
  private executionHistory: Map<number, TestExecution[]> = new Map();

  /**
   * Record test execution
   */
  recordExecution(execution: TestExecution): void {
    const history = this.executionHistory.get(execution.testCaseId) || [];
    history.push(execution);
    // Keep last 100 executions per test
    if (history.length > 100) {
      history.shift();
    }
    this.executionHistory.set(execution.testCaseId, history);
  }

  /**
   * Batch record executions
   */
  recordExecutions(executions: TestExecution[]): void {
    executions.forEach((exe) => this.recordExecution(exe));
  }

  /**
   * Analyze flakiness for a test case
   */
  analyzeFlakiness(testCaseId: number, testCaseName: string): FlakinessAnalysis {
    const history = this.executionHistory.get(testCaseId) || [];

    if (history.length === 0) {
      return {
        testCaseId,
        testCaseName,
        totalRuns: 0,
        passCount: 0,
        failCount: 0,
        skipCount: 0,
        blockCount: 0,
        passRate: 0,
        flakinessScore: 0,
        flakinessCategory: 'stable',
        confidence: 0,
        commonFailures: [],
        trend: 'stable',
        recommendations: ['No execution history available'],
      };
    }

    // Calculate statistics
    const passCount = history.filter((e) => e.status === 'passed').length;
    const failCount = history.filter((e) => e.status === 'failed').length;
    const skipCount = history.filter((e) => e.status === 'skipped').length;
    const blockCount = history.filter((e) => e.status === 'blocked').length;
    const passRate = (passCount / history.length) * 100;

    // Calculate flakiness score
    const flakinessScore = this.calculateFlakinessScore(history);

    // Determine category
    const flakinessCategory = this.categorizFlakiness(flakinessScore);

    // Find common failure patterns
    const commonFailures = this.findCommonFailures(history);

    // Detect environment correlation
    const environmentCorrelation = this.detectEnvironmentCorrelation(history);

    // Analyze trend
    const trend = this.analyzeTrend(history);

    // Calculate confidence based on sample size
    const confidence = Math.min((history.length / 30) * 100, 100);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      flakinessScore,
      passRate,
      trend,
      commonFailures,
      environmentCorrelation
    );

    return {
      testCaseId,
      testCaseName,
      totalRuns: history.length,
      passCount,
      failCount,
      skipCount,
      blockCount,
      passRate,
      flakinessScore,
      flakinessCategory,
      confidence,
      commonFailures,
      environmentCorrelation,
      trend,
      recommendations,
      lastRun: history[history.length - 1],
    };
  }

  /**
   * Find all flaky tests above threshold
   */
  findFlakyTests(threshold: number = 50): FlakinessAnalysis[] {
    const results: FlakinessAnalysis[] = [];

    this.executionHistory.forEach((_, testCaseId) => {
      const analysis = this.analyzeFlakiness(testCaseId, `Test ${testCaseId}`);
      if (analysis.flakinessScore >= threshold) {
        results.push(analysis);
      }
    });

    return results.sort((a, b) => b.flakinessScore - a.flakinessScore);
  }

  /**
   * Get execution history for test
   */
  getHistory(testCaseId: number): TestExecution[] {
    return this.executionHistory.get(testCaseId) || [];
  }

  /**
   * Clear old executions
   */
  clearOldExecutions(daysOld: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let removedCount = 0;

    this.executionHistory.forEach((history, testCaseId) => {
      const filtered = history.filter((exe) => exe.timestamp > cutoffDate);
      removedCount += history.length - filtered.length;
      this.executionHistory.set(testCaseId, filtered);
    });

    return removedCount;
  }

  /**
   * Export flakiness report
   */
  exportReport(minSamples: number = 5): string {
    const results: FlakinessAnalysis[] = [];

    this.executionHistory.forEach((history, testCaseId) => {
      if (history.length >= minSamples) {
        results.push(this.analyzeFlakiness(testCaseId, `Test ${testCaseId}`));
      }
    });

    results.sort((a, b) => b.flakinessScore - a.flakinessScore);

    let report = '# Flaky Test Report\n\n';
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total Tests Analyzed: ${results.length}\n\n`;

    const veryFlaky = results.filter((r) => r.flakinessCategory === 'very-flaky');
    const flaky = results.filter((r) => r.flakinessCategory === 'flaky');

    if (veryFlaky.length > 0) {
      report += `## 🔴 Very Flaky (${veryFlaky.length})\n\n`;
      veryFlaky.forEach((r) => {
        report += this.formatAnalysisForReport(r);
      });
    }

    if (flaky.length > 0) {
      report += `## 🟡 Flaky (${flaky.length})\n\n`;
      flaky.forEach((r) => {
        report += this.formatAnalysisForReport(r);
      });
    }

    return report;
  }

  /**
   * Private: Calculate flakiness score
   */
  private calculateFlakinessScore(history: TestExecution[]): number {
    if (history.length < 2) return 0;

    let score = 0;

    // Calculate pass rate variance (flakiness indicator)
    const chunkSize = Math.max(1, Math.floor(history.length / 5));
    const chunks = [];

    for (let i = 0; i < history.length; i += chunkSize) {
      const chunk = history.slice(i, i + chunkSize);
      const passRate = (chunk.filter((e) => e.status === 'passed').length / chunk.length) * 100;
      chunks.push(passRate);
    }

    // Calculate variance (high variance = flaky)
    const mean = chunks.reduce((a, b) => a + b) / chunks.length;
    const variance = chunks.reduce((acc, rate) => acc + Math.pow(rate - mean, 2), 0) / chunks.length;
    const stdDev = Math.sqrt(variance);

    score = Math.min(stdDev, 100); // Normalize to 0-100

    // Factor in failure count
    const failCount = history.filter((e) => e.status === 'failed').length;
    const failRate = (failCount / history.length) * 100;

    if (failRate > 50) {
      score = Math.max(score, 80); // Very flaky if >50% failures
    } else if (failRate > 20) {
      score = Math.max(score, 60); // Flaky if >20% failures
    } else if (failRate > 5) {
      score = Math.max(score, 30); // Occasionally flaky if >5%
    }

    return Math.round(score);
  }

  /**
   * Private: Categorize flakiness
   */
  private categorizFlakiness(
    score: number
  ): 'stable' | 'occasionally-flaky' | 'flaky' | 'very-flaky' {
    if (score < 20) return 'stable';
    if (score < 50) return 'occasionally-flaky';
    if (score < 75) return 'flaky';
    return 'very-flaky';
  }

  /**
   * Private: Find common failure patterns
   */
  private findCommonFailures(history: TestExecution[]): string[] {
    const failures = history.filter((e) => e.status === 'failed' && e.errorMessage);
    const errorPatterns: Map<string, number> = new Map();

    failures.forEach((exe) => {
      const message = exe.errorMessage || '';
      // Extract error type/message pattern
      const pattern = message.split(':')[0] || message.substring(0, 50);

      errorPatterns.set(pattern, (errorPatterns.get(pattern) || 0) + 1);
    });

    return Array.from(errorPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern]) => pattern);
  }

  /**
   * Private: Detect environment correlation
   */
  private detectEnvironmentCorrelation(history: TestExecution[]): string | undefined {
    const failures = history.filter((e) => e.status === 'failed');
    if (failures.length === 0) return undefined;

    const envPatterns: Map<string, number> = new Map();

    failures.forEach((exe) => {
      const env = exe.environmentInfo;
      if (env) {
        const key = `${env.browser || 'unknown'} / ${env.os || 'unknown'}`;
        envPatterns.set(key, (envPatterns.get(key) || 0) + 1);
      }
    });

    const sorted = Array.from(envPatterns.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : undefined;
  }

  /**
   * Private: Analyze trend
   */
  private analyzeTrend(
    history: TestExecution[]
  ): 'improving' | 'degrading' | 'stable' {
    if (history.length < 10) return 'stable';

    const midpoint = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, midpoint);
    const secondHalf = history.slice(midpoint);

    const firstPassRate = (firstHalf.filter((e) => e.status === 'passed').length / firstHalf.length) * 100;
    const secondPassRate = (secondHalf.filter((e) => e.status === 'passed').length / secondHalf.length) * 100;

    const diff = secondPassRate - firstPassRate;

    if (diff > 10) return 'improving';
    if (diff < -10) return 'degrading';
    return 'stable';
  }

  /**
   * Private: Generate recommendations
   */
  private generateRecommendations(
    score: number,
    passRate: number,
    trend: string,
    commonFailures: string[],
    environment?: string
  ): string[] {
    const recommendations: string[] = [];

    if (score >= 75) {
      recommendations.push('⚠️ CRITICAL: Test is very flaky. Consider disabling until fixed.');
      recommendations.push('Review test logic for race conditions, timing issues, or external dependencies.');
    } else if (score >= 50) {
      recommendations.push('Test shows significant flakiness. Investigate failure patterns.');
      if (environment) {
        recommendations.push(`Failures concentrated in: ${environment}. Check environment-specific issues.`);
      }
    } else if (score >= 20) {
      recommendations.push('Test occasionally fails. Add retry logic or review expectations.');
    }

    if (commonFailures.length > 0) {
      recommendations.push(`Common failures: ${commonFailures.join(', ')}`);
    }

    if (trend === 'degrading') {
      recommendations.push('Test is getting flakier over time. Urgent review needed.');
    } else if (trend === 'improving') {
      recommendations.push('Test is improving. Continue monitoring.');
    }

    return recommendations.length > 0 ? recommendations : ['Test is stable. No action needed.'];
  }

  /**
   * Private: Format analysis for report
   */
  private formatAnalysisForReport(analysis: FlakinessAnalysis): string {
    let report = `### ${analysis.testCaseName}\n`;
    report += `- **Runs**: ${analysis.totalRuns} (${(analysis.confidence).toFixed(0)}% confidence)\n`;
    report += `- **Pass Rate**: ${analysis.passRate.toFixed(1)}% (${analysis.passCount}/${analysis.totalRuns})\n`;
    report += `- **Flakiness Score**: ${analysis.flakinessScore}/100\n`;
    report += `- **Trend**: ${analysis.trend}\n`;

    if (analysis.environmentCorrelation) {
      report += `- **Environment**: ${analysis.environmentCorrelation}\n`;
    }

    if (analysis.commonFailures.length > 0) {
      report += `- **Common Failures**: ${analysis.commonFailures.join(', ')}\n`;
    }

    report += `\n**Recommendations**:\n`;
    analysis.recommendations.forEach((rec) => {
      report += `- ${rec}\n`;
    });

    report += '\n';
    return report;
  }
}
