/**
 * Regression Suite Generator
 * Identifies and organizes regression test cases for release validation
 */

import { TestCase } from '@/types';

export interface RegressionTestCase extends TestCase {
  baselineId?: string;
  regressionRisk: 'low' | 'medium' | 'high' | 'critical';
  affectedModules?: string[];
  changeImpactScore?: number; // 0-100
  coverageArea?: string;
}

export interface RegressionSuite {
  id: string;
  name: string;
  releaseVersion: string;
  description?: string;
  createdAt: Date;
  baselineVersion: string;
  testCases: RegressionTestCase[];
  statistics: RegressionStatistics;
  focusAreas?: string[];
  excludedAreas?: string[];
}

export interface RegressionStatistics {
  totalTests: number;
  criticalTests: number;
  highRiskTests: number;
  mediumRiskTests: number;
  lowRiskTests: number;
  estimatedExecutionTime: number; // minutes
  automatedCoverage: number; // percentage
}

export interface ChangeImpactAnalysis {
  moduleId: string;
  moduleName: string;
  changedFiles: string[];
  affectedTests: number;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedRegressionTests: number;
  recommendations: string[];
}

export class RegressionGenerator {
  private testCases: Map<number, TestCase> = new Map();
  private baselineTestCases: Map<number, TestCase> = new Map();
  private regressionSuites: Map<string, RegressionSuite> = new Map();

  /**
   * Register current test cases
   */
  registerTestCases(testCases: TestCase[]): void {
    testCases.forEach((tc) => {
      if (tc.id) {
        this.testCases.set(tc.id, tc);
      }
    });
  }

  /**
   * Register baseline test cases (from previous release)
   */
  registerBaseline(baselineTestCases: TestCase[], baselineVersion: string): void {
    baselineTestCases.forEach((tc) => {
      if (tc.id) {
        this.baselineTestCases.set(tc.id, tc);
      }
    });
  }

  /**
   * Generate regression suite based on change analysis
   */
  generateRegressionSuite(
    releaseVersion: string,
    baselineVersion: string,
    changedModules: string[] = []
  ): RegressionSuite {
    const testCases: RegressionTestCase[] = [];

    // Identify affected tests based on changed modules
    this.testCases.forEach((tc) => {
      const regressionTestCase = this.createRegressionTestCase(
        tc,
        changedModules
      );

      if (regressionTestCase.regressionRisk !== 'low') {
        testCases.push(regressionTestCase);
      }
    });

    // Add critical tests from baseline (always regress)
    this.baselineTestCases.forEach((btc) => {
      if (btc.priority === 'critical' && !testCases.find((t) => t.id === btc.id)) {
        testCases.push({
          ...btc,
          regressionRisk: 'critical',
          baselineId: btc.id?.toString(),
        } as RegressionTestCase);
      }
    });

    const suite: RegressionSuite = {
      id: this.generateId(),
      name: `Regression Suite - Release ${releaseVersion}`,
      releaseVersion,
      baselineVersion,
      createdAt: new Date(),
      testCases,
      statistics: this.calculateStatistics(testCases),
      focusAreas: changedModules,
    };

    this.regressionSuites.set(suite.id, suite);
    return suite;
  }

  /**
   * Analyze impact of changes on existing tests
   */
  analyzeChangeImpact(changedModules: string[]): ChangeImpactAnalysis[] {
    const impact: Map<string, ChangeImpactAnalysis> = new Map();

    changedModules.forEach((module) => {
      const affectedTests = this.findAffectedTests(module);
      const riskLevel = this.calculateRiskLevel(affectedTests);

      impact.set(module, {
        moduleId: module,
        moduleName: this.getModuleName(module),
        changedFiles: [module],
        affectedTests: affectedTests.length,
        riskLevel,
        estimatedRegressionTests: this.estimateRegressionTestCount(
          affectedTests
        ),
        recommendations: this.generateRecommendations(riskLevel, affectedTests),
      });
    });

    return Array.from(impact.values());
  }

  /**
   * Create priority-based regression suite
   */
  createPriorityBasedSuite(
    releaseVersion: string,
    maxTests: number = 50
  ): RegressionSuite {
    const testCases: RegressionTestCase[] = [];

    // Sort by priority and risk
    const sorted = Array.from(this.testCases.values())
      .map((tc) => this.createRegressionTestCase(tc, []))
      .sort((a, b) => {
        const riskScore = this.getRiskScore(b.regressionRisk) - this.getRiskScore(a.regressionRisk);
        if (riskScore !== 0) return riskScore;

        const priorityScore = this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority);
        return priorityScore;
      });

    // Take top N tests
    testCases.push(...sorted.slice(0, maxTests));

    const suite: RegressionSuite = {
      id: this.generateId(),
      name: `Priority Regression Suite - Release ${releaseVersion}`,
      releaseVersion,
      baselineVersion: 'current',
      createdAt: new Date(),
      testCases,
      statistics: this.calculateStatistics(testCases),
    };

    this.regressionSuites.set(suite.id, suite);
    return suite;
  }

  /**
   * Generate smoke test regression suite
   */
  createSmokeTestSuite(releaseVersion: string): RegressionSuite {
    const testCases: RegressionTestCase[] = Array.from(this.testCases.values())
      .filter((tc) => tc.priority === 'critical' || tc.priority === 'high')
      .map((tc) => ({
        ...tc,
        regressionRisk: 'critical',
      }))
      .slice(0, 20); // Limit to ~20 smoke tests

    const suite: RegressionSuite = {
      id: this.generateId(),
      name: `Smoke Test Suite - Release ${releaseVersion}`,
      releaseVersion,
      baselineVersion: 'current',
      createdAt: new Date(),
      testCases,
      statistics: this.calculateStatistics(testCases),
    };

    this.regressionSuites.set(suite.id, suite);
    return suite;
  }

  /**
   * Compare current and baseline test coverage
   */
  compareCoverage(baselineVersion: string, currentVersion: string): {
    newTests: TestCase[];
    removedTests: TestCase[];
    modifiedTests: Array<{ before: TestCase; after: TestCase }>;
    coverageChange: number;
  } {
    const newTests: TestCase[] = [];
    const removedTests: TestCase[] = [];
    const modifiedTests: Array<{ before: TestCase; after: TestCase }> = [];

    // Find new tests
    this.testCases.forEach((current, id) => {
      if (!this.baselineTestCases.has(id)) {
        newTests.push(current);
      }
    });

    // Find removed tests
    this.baselineTestCases.forEach((baseline, id) => {
      if (!this.testCases.has(id)) {
        removedTests.push(baseline);
      }
    });

    // Find modified tests
    this.testCases.forEach((current, id) => {
      const baseline = this.baselineTestCases.get(id);
      if (baseline && this.hasTestChanged(baseline, current)) {
        modifiedTests.push({ before: baseline, after: current });
      }
    });

    const baselineCount = this.baselineTestCases.size;
    const currentCount = this.testCases.size;
    const coverageChange =
      baselineCount > 0
        ? ((currentCount - baselineCount) / baselineCount) * 100
        : 0;

    return {
      newTests,
      removedTests,
      modifiedTests,
      coverageChange,
    };
  }

  /**
   * Get regression suite by ID
   */
  getSuite(suiteId: string): RegressionSuite | undefined {
    return this.regressionSuites.get(suiteId);
  }

  /**
   * Export regression suite for test execution
   */
  exportSuite(suiteId: string, format: 'json' | 'csv' = 'json'): string {
    const suite = this.regressionSuites.get(suiteId);
    if (!suite) return '';

    if (format === 'csv') {
      let csv = 'Test ID,Name,Risk,Priority,Module,Estimated Duration\n';
      suite.testCases.forEach((tc) => {
        csv += `${tc.id},${tc.name},${tc.regressionRisk},${tc.priority},${tc.affectedModules?.join('|') || ''},${tc.estimatedDuration || 0}\n`;
      });
      return csv;
    }

    return JSON.stringify(suite, null, 2);
  }

  /**
   * Generate regression report
   */
  generateReport(suiteId: string): string {
    const suite = this.regressionSuites.get(suiteId);
    if (!suite) return '';

    let report = `# Regression Test Report\n\n`;
    report += `**Release Version**: ${suite.releaseVersion}\n`;
    report += `**Baseline Version**: ${suite.baselineVersion}\n`;
    report += `**Generated**: ${suite.createdAt.toLocaleDateString()}\n\n`;

    report += `## Summary\n`;
    report += `- Total Tests: ${suite.statistics.totalTests}\n`;
    report += `- Critical: ${suite.statistics.criticalTests}\n`;
    report += `- High Risk: ${suite.statistics.highRiskTests}\n`;
    report += `- Medium Risk: ${suite.statistics.mediumRiskTests}\n`;
    report += `- Low Risk: ${suite.statistics.lowRiskTests}\n`;
    report += `- Estimated Time: ${suite.statistics.estimatedExecutionTime}m\n`;
    report += `- Automation Coverage: ${suite.statistics.automatedCoverage}%\n\n`;

    if (suite.focusAreas && suite.focusAreas.length > 0) {
      report += `## Focus Areas\n`;
      suite.focusAreas.forEach((area) => {
        report += `- ${area}\n`;
      });
      report += '\n';
    }

    report += `## Test Cases\n\n`;

    const riskGroups = new Map<string, RegressionTestCase[]>();
    ['critical', 'high', 'medium', 'low'].forEach((risk) => {
      const tests = suite.testCases.filter(
        (t) => t.regressionRisk === risk
      );
      if (tests.length > 0) {
        riskGroups.set(risk, tests);
      }
    });

    riskGroups.forEach((tests, risk) => {
      report += `### ${risk.toUpperCase()} RISK (${tests.length})\n`;
      tests.forEach((tc) => {
        report += `- **${tc.name}** (ID: ${tc.id}, Priority: ${tc.priority})\n`;
      });
      report += '\n';
    });

    return report;
  }

  /**
   * Private: Create regression test case
   */
  private createRegressionTestCase(
    tc: TestCase,
    changedModules: string[]
  ): RegressionTestCase {
    const affectedModules = this.findAffectedModules(tc, changedModules);
    const regressionRisk = this.calculateRegressionRisk(tc, affectedModules);
    const changeImpactScore = this.calculateChangeImpactScore(
      tc,
      affectedModules
    );

    return {
      ...tc,
      affectedModules,
      regressionRisk,
      changeImpactScore,
      coverageArea: this.determineCoverageArea(tc),
    };
  }

  /**
   * Private: Calculate statistics
   */
  private calculateStatistics(testCases: RegressionTestCase[]): RegressionStatistics {
    const critical = testCases.filter((t) => t.regressionRisk === 'critical').length;
    const high = testCases.filter((t) => t.regressionRisk === 'high').length;
    const medium = testCases.filter((t) => t.regressionRisk === 'medium').length;
    const low = testCases.filter((t) => t.regressionRisk === 'low').length;

    const estimatedTime = testCases.reduce((sum, t) => sum + (t.estimatedDuration || 5), 0);
    const automated = testCases.filter(
      (t) => t.automationStatus === 'automated' || t.automationStatus === 'can-automate'
    ).length;

    return {
      totalTests: testCases.length,
      criticalTests: critical,
      highRiskTests: high,
      mediumRiskTests: medium,
      lowRiskTests: low,
      estimatedExecutionTime: estimatedTime,
      automatedCoverage: testCases.length > 0
        ? (automated / testCases.length) * 100
        : 0,
    };
  }

  /**
   * Private: Calculate regression risk
   */
  private calculateRegressionRisk(
    tc: TestCase,
    affectedModules: string[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0;

    // Priority factor
    if (tc.priority === 'critical') riskScore += 40;
    else if (tc.priority === 'high') riskScore += 30;
    else if (tc.priority === 'medium') riskScore += 15;

    // Affected modules factor
    riskScore += affectedModules.length * 10;

    // Automation factor (manual tests riskier)
    if (tc.automationStatus !== 'automated') riskScore += 10;

    if (riskScore >= 60) return 'critical';
    if (riskScore >= 45) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  }

  /**
   * Private: Find affected modules
   */
  private findAffectedModules(tc: TestCase, changedModules: string[]): string[] {
    const affected: string[] = [];

    changedModules.forEach((module) => {
      if (
        tc.name?.toLowerCase().includes(module.toLowerCase()) ||
        tc.description?.toLowerCase().includes(module.toLowerCase())
      ) {
        affected.push(module);
      }
    });

    return affected;
  }

  /**
   * Private: Find affected tests
   */
  private findAffectedTests(module: string): TestCase[] {
    return Array.from(this.testCases.values()).filter(
      (tc) =>
        tc.name?.toLowerCase().includes(module.toLowerCase()) ||
        tc.description?.toLowerCase().includes(module.toLowerCase())
    );
  }

  /**
   * Private: Helper methods
   */
  private calculateChangeImpactScore(tc: TestCase, affectedModules: string[]): number {
    return Math.min(affectedModules.length * 20 + (tc.priority === 'critical' ? 20 : 0), 100);
  }

  private determineCoverageArea(tc: TestCase): string {
    // Extract from test name or description
    return tc.name?.split(' ')[0] || 'general';
  }

  private findAffectedTests(module: string): TestCase[] {
    return Array.from(this.testCases.values()).filter(
      (tc) =>
        tc.name?.toLowerCase().includes(module.toLowerCase()) ||
        tc.description?.toLowerCase().includes(module.toLowerCase())
    );
  }

  private calculateRiskLevel(tests: TestCase[]): 'low' | 'medium' | 'high' {
    const criticalCount = tests.filter((t) => t.priority === 'critical').length;
    const highCount = tests.filter((t) => t.priority === 'high').length;

    if (criticalCount > 0 || tests.length > 50) return 'high';
    if (highCount > 5 || tests.length > 20) return 'medium';
    return 'low';
  }

  private estimateRegressionTestCount(tests: TestCase[]): number {
    return Math.ceil(tests.length * 0.8); // Estimate 80% of affected tests
  }

  private generateRecommendations(riskLevel: string, tests: TestCase[]): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'high') {
      recommendations.push('Execute full regression suite');
      recommendations.push('Increase test automation coverage');
    } else if (riskLevel === 'medium') {
      recommendations.push('Execute priority regression tests');
      recommendations.push('Manual testing recommended');
    } else {
      recommendations.push('Execute smoke tests');
      recommendations.push('Standard regression cycle sufficient');
    }

    return recommendations;
  }

  private getModuleName(module: string): string {
    return module.split('/').pop() || module;
  }

  private getRiskScore(risk: string): number {
    const scores: Record<string, number> = { critical: 100, high: 75, medium: 50, low: 25 };
    return scores[risk] || 0;
  }

  private getPriorityScore(priority: string | undefined): number {
    const scores: Record<string, number> = { critical: 100, high: 75, medium: 50, low: 25 };
    return scores[priority || 'medium'] || 0;
  }

  private hasTestChanged(before: TestCase, after: TestCase): boolean {
    return (
      before.name !== after.name ||
      before.description !== after.description ||
      JSON.stringify(before.steps) !== JSON.stringify(after.steps)
    );
  }

  private generateId(): string {
    return `regressions_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
