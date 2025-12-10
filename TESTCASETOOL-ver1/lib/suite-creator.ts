/**
 * Automatic Suite Creator
 * Create test suites from static lists, query-based filters, or requirement associations
 */

import { TestCase } from '@/types';

export type SuiteType = 'static' | 'query-based' | 'requirement-based' | 'regression';

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  type: SuiteType;
  testCaseIds: number[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  tags?: string[];
  queryFilter?: QueryFilter;
  requirementAssociation?: RequirementAssociation;
  automationStatus?: 'manual' | 'automated' | 'mixed';
  estimatedDuration?: number; // minutes
  priority?: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
}

export interface QueryFilter {
  field: 'priority' | 'status' | 'automationStatus' | 'tags' | 'assignedTo';
  operator: 'equals' | 'contains' | 'startsWith' | 'in' | 'greaterThan';
  value: any;
}

export interface RequirementAssociation {
  requirementId: string;
  requirementTitle: string;
  linkedWorkItemIds?: number[];
  syncMode: 'automatic' | 'manual'; // Automatic updates when requirement changes
}

export interface SuiteStatistics {
  totalTests: number;
  automatedTests: number;
  manualTests: number;
  estimatedExecutionTime: number;
  averagePassRate?: number;
  coverage?: Record<string, number>; // Coverage by priority, status, etc.
}

export class SuiteCreator {
  private suites: Map<string, TestSuite> = new Map();
  private testCases: Map<number, TestCase> = new Map();

  /**
   * Register test cases (for query evaluation)
   */
  registerTestCases(testCases: TestCase[]): void {
    testCases.forEach((tc) => {
      if (tc.id) {
        this.testCases.set(tc.id, tc);
      }
    });
  }

  /**
   * Create static suite
   */
  createStaticSuite(
    name: string,
    testCaseIds: number[],
    options?: {
      description?: string;
      tags?: string[];
      createdBy?: string;
    }
  ): TestSuite {
    const suite: TestSuite = {
      id: this.generateSuiteId(),
      name,
      description: options?.description,
      type: 'static',
      testCaseIds,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options?.createdBy,
      tags: options?.tags,
      isActive: true,
    };

    this.suites.set(suite.id, suite);
    return suite;
  }

  /**
   * Create query-based suite (dynamic)
   */
  createQueryBasedSuite(
    name: string,
    filters: QueryFilter[],
    options?: {
      description?: string;
      tags?: string[];
      createdBy?: string;
    }
  ): TestSuite {
    // Evaluate filters to get test cases
    const testCaseIds = this.evaluateFilters(filters);

    const suite: TestSuite = {
      id: this.generateSuiteId(),
      name,
      description: options?.description,
      type: 'query-based',
      testCaseIds,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options?.createdBy,
      tags: options?.tags,
      queryFilter: filters[0], // Store first filter as reference
      isActive: true,
    };

    this.suites.set(suite.id, suite);
    return suite;
  }

  /**
   * Create requirement-based suite
   */
  createRequirementSuite(
    name: string,
    requirementId: string,
    linkedWorkItemIds: number[],
    options?: {
      description?: string;
      tags?: string[];
      createdBy?: string;
      syncMode?: 'automatic' | 'manual';
    }
  ): TestSuite {
    const suite: TestSuite = {
      id: this.generateSuiteId(),
      name,
      description: options?.description,
      type: 'requirement-based',
      testCaseIds: linkedWorkItemIds,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options?.createdBy,
      tags: options?.tags,
      requirementAssociation: {
        requirementId,
        requirementTitle: name,
        linkedWorkItemIds,
        syncMode: options?.syncMode || 'manual',
      },
      isActive: true,
    };

    this.suites.set(suite.id, suite);
    return suite;
  }

  /**
   * Create regression suite from latest test runs
   */
  createRegressionSuite(
    name: string,
    baselineTestCaseIds: number[],
    options?: {
      description?: string;
      createdBy?: string;
    }
  ): TestSuite {
    const suite: TestSuite = {
      id: this.generateSuiteId(),
      name: name || `Regression Suite - ${new Date().toLocaleDateString()}`,
      description:
        options?.description ||
        'Regression suite created from baseline tests to verify no regressions',
      type: 'regression',
      testCaseIds: baselineTestCaseIds,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options?.createdBy,
      isActive: true,
    };

    this.suites.set(suite.id, suite);
    return suite;
  }

  /**
   * Get suite by ID
   */
  getSuite(suiteId: string): TestSuite | undefined {
    return this.suites.get(suiteId);
  }

  /**
   * Get all suites
   */
  getAllSuites(): TestSuite[] {
    return Array.from(this.suites.values());
  }

  /**
   * Update suite (add/remove test cases, update filters)
   */
  updateSuite(
    suiteId: string,
    updates: Partial<TestSuite>
  ): TestSuite | undefined {
    const suite = this.suites.get(suiteId);
    if (!suite) return undefined;

    const updated = { ...suite, ...updates, updatedAt: new Date() };
    this.suites.set(suiteId, updated);
    return updated;
  }

  /**
   * Add test case to suite
   */
  addTestCaseToSuite(suiteId: string, testCaseId: number): boolean {
    const suite = this.suites.get(suiteId);
    if (!suite) return false;

    if (!suite.testCaseIds.includes(testCaseId)) {
      suite.testCaseIds.push(testCaseId);
      suite.updatedAt = new Date();
    }

    return true;
  }

  /**
   * Remove test case from suite
   */
  removeTestCaseFromSuite(suiteId: string, testCaseId: number): boolean {
    const suite = this.suites.get(suiteId);
    if (!suite) return false;

    suite.testCaseIds = suite.testCaseIds.filter((id) => id !== testCaseId);
    suite.updatedAt = new Date();

    return true;
  }

  /**
   * Delete suite
   */
  deleteSuite(suiteId: string): boolean {
    return this.suites.delete(suiteId);
  }

  /**
   * Calculate suite statistics
   */
  calculateStatistics(suiteId: string): SuiteStatistics | undefined {
    const suite = this.suites.get(suiteId);
    if (!suite) return undefined;

    let automatedCount = 0;
    let manualCount = 0;
    let totalDuration = 0;

    suite.testCaseIds.forEach((id) => {
      const tc = this.testCases.get(id);
      if (tc) {
        if (tc.automationStatus === 'automated' || tc.automationStatus === 'can-automate') {
          automatedCount++;
        } else {
          manualCount++;
        }

        if (tc.estimatedDuration) {
          totalDuration += tc.estimatedDuration;
        }
      }
    });

    return {
      totalTests: suite.testCaseIds.length,
      automatedTests: automatedCount,
      manualTests: manualCount,
      estimatedExecutionTime: totalDuration,
    };
  }

  /**
   * Export suite for test runner (JSON format)
   */
  exportSuite(suiteId: string): string {
    const suite = this.suites.get(suiteId);
    if (!suite) return '';

    const testCases = suite.testCaseIds
      .map((id) => this.testCases.get(id))
      .filter((tc) => tc !== undefined) as TestCase[];

    const exportData = {
      suite: {
        id: suite.id,
        name: suite.name,
        type: suite.type,
        createdAt: suite.createdAt.toISOString(),
      },
      testCases: testCases.map((tc) => ({
        id: tc.id,
        name: tc.name,
        description: tc.description,
        steps: tc.steps,
        priority: tc.priority,
        automationStatus: tc.automationStatus,
      })),
      statistics: this.calculateStatistics(suiteId),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export suite as YAML (for CI/CD)
   */
  exportSuiteAsYaml(suiteId: string): string {
    const suite = this.suites.get(suiteId);
    if (!suite) return '';

    let yaml = `suite:\n`;
    yaml += `  name: ${suite.name}\n`;
    yaml += `  type: ${suite.type}\n`;
    yaml += `  testCases:\n`;

    suite.testCaseIds.forEach((id) => {
      const tc = this.testCases.get(id);
      if (tc) {
        yaml += `    - id: ${id}\n`;
        yaml += `      name: ${tc.name}\n`;
        yaml += `      priority: ${tc.priority}\n`;
      }
    });

    return yaml;
  }

  /**
   * Sync requirement-based suite with latest linked work items
   */
  syncRequirementSuite(suiteId: string, updatedWorkItemIds: number[]): TestSuite | undefined {
    const suite = this.suites.get(suiteId);
    if (!suite || suite.type !== 'requirement-based') return undefined;

    suite.testCaseIds = updatedWorkItemIds;
    suite.updatedAt = new Date();

    if (suite.requirementAssociation) {
      suite.requirementAssociation.linkedWorkItemIds = updatedWorkItemIds;
    }

    return suite;
  }

  /**
   * Refresh query-based suite (re-evaluate filters)
   */
  refreshQuerySuite(suiteId: string): TestSuite | undefined {
    const suite = this.suites.get(suiteId);
    if (!suite || suite.type !== 'query-based' || !suite.queryFilter) return undefined;

    const newTestCaseIds = this.evaluateFilters([suite.queryFilter]);
    suite.testCaseIds = newTestCaseIds;
    suite.updatedAt = new Date();

    return suite;
  }

  /**
   * Create suite from execution results (smoke test, failed tests, etc.)
   */
  createSuiteFromResults(
    name: string,
    testResults: Array<{ testCaseId: number; status: string }>,
    statusFilter: string
  ): TestSuite {
    const filteredIds = testResults
      .filter((r) => r.status === statusFilter)
      .map((r) => r.testCaseId);

    return this.createStaticSuite(name, filteredIds);
  }

  /**
   * Private: Generate unique suite ID
   */
  private generateSuiteId(): string {
    return `suite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Private: Evaluate query filters
   */
  private evaluateFilters(filters: QueryFilter[]): number[] {
    const results = new Set<number>();

    this.testCases.forEach((testCase) => {
      let matches = true;

      for (const filter of filters) {
        const fieldValue = (testCase as any)[filter.field];

        switch (filter.operator) {
          case 'equals':
            if (fieldValue !== filter.value) matches = false;
            break;
          case 'contains':
            if (
              !fieldValue ||
              !String(fieldValue).toLowerCase().includes(String(filter.value).toLowerCase())
            ) {
              matches = false;
            }
            break;
          case 'startsWith':
            if (!fieldValue || !String(fieldValue).startsWith(String(filter.value))) {
              matches = false;
            }
            break;
          case 'in':
            if (!Array.isArray(filter.value) || !filter.value.includes(fieldValue)) {
              matches = false;
            }
            break;
          case 'greaterThan':
            if (!fieldValue || fieldValue <= filter.value) {
              matches = false;
            }
            break;
        }

        if (!matches) break;
      }

      if (matches && testCase.id) {
        results.add(testCase.id);
      }
    });

    return Array.from(results);
  }
}
