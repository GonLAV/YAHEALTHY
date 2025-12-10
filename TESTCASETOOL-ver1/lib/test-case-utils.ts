import { TestCase, TestStep } from '@/types';

/**
 * Utility functions for test case operations
 */
export class TestCaseUtils {
  /**
   * Validate a test case
   */
  static validate(testCase: TestCase): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!testCase.title || testCase.title.trim() === '') {
      errors.push('Title is required');
    }

    if (testCase.title && testCase.title.length > 255) {
      errors.push('Title must be less than 255 characters');
    }

    if (testCase.testSteps.length === 0) {
      errors.push('At least one test step is required');
    }

    testCase.testSteps.forEach((step, index) => {
      if (!step.action || step.action.trim() === '') {
        errors.push(`Step ${index + 1}: Action is required`);
      }
      if (step.action && step.action.length > 4000) {
        errors.push(`Step ${index + 1}: Action is too long`);
      }
      if (step.expectedResult && step.expectedResult.length > 4000) {
        errors.push(`Step ${index + 1}: Expected result is too long`);
      }
    });

    if (testCase.priority && (testCase.priority < 0 || testCase.priority > 4)) {
      errors.push('Priority must be between 0 and 4');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone a test case
   */
  static clone(testCase: TestCase): TestCase {
    return JSON.parse(JSON.stringify(testCase));
  }

  /**
   * Create a test case from a template
   */
  static fromTemplate(
    template: Partial<TestCase>,
    overrides: Partial<TestCase>
  ): TestCase {
    const defaultCase: TestCase = {
      title: '',
      description: '',
      testSteps: [],
      tags: [],
      priority: 2,
      automation: 'Not Automated',
    };

    return {
      ...defaultCase,
      ...template,
      ...overrides,
      testSteps: [
        ...((template?.testSteps as TestStep[]) || []),
        ...(overrides?.testSteps || []),
      ],
      tags: [
        ...(template?.tags || []),
        ...(overrides?.tags || []),
      ],
    };
  }

  /**
   * Calculate test case statistics
   */
  static getStats(testCases: TestCase[]) {
    return {
      total: testCases.length,
      byPriority: {
        critical: testCases.filter((tc) => tc.priority === 0).length,
        high: testCases.filter((tc) => tc.priority === 1).length,
        medium: testCases.filter((tc) => tc.priority === 2).length,
        low: testCases.filter((tc) => tc.priority === 3).length,
      },
      byAutomation: {
        notAutomated: testCases.filter((tc) => tc.automation === 'Not Automated')
          .length,
        planned: testCases.filter((tc) => tc.automation === 'Planned').length,
        inProgress: testCases.filter((tc) => tc.automation === 'In Progress')
          .length,
        automated: testCases.filter((tc) => tc.automation === 'Automated').length,
      },
      averageSteps:
        testCases.length > 0
          ? testCases.reduce((sum, tc) => sum + tc.testSteps.length, 0) /
            testCases.length
          : 0,
      withTags: testCases.filter((tc) => tc.tags && tc.tags.length > 0).length,
    };
  }

  /**
   * Sort test cases
   */
  static sort(
    testCases: TestCase[],
    sortBy: 'title' | 'priority' | 'automation' | 'created'
  ): TestCase[] {
    const sorted = [...testCases];

    switch (sortBy) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'priority':
        sorted.sort((a, b) => (a.priority || 2) - (b.priority || 2));
        break;
      case 'automation':
        sorted.sort((a, b) =>
          (a.automation || '').localeCompare(b.automation || '')
        );
        break;
      case 'created':
        sorted.sort((a, b) =>
          new Date(b.createdDate || 0).getTime() -
          new Date(a.createdDate || 0).getTime()
        );
        break;
    }

    return sorted;
  }

  /**
   * Filter test cases
   */
  static filter(
    testCases: TestCase[],
    criteria: {
      priority?: number;
      automation?: string;
      tags?: string[];
      searchText?: string;
    }
  ): TestCase[] {
    return testCases.filter((tc) => {
      if (
        criteria.priority !== undefined &&
        tc.priority !== criteria.priority
      ) {
        return false;
      }

      if (
        criteria.automation &&
        tc.automation !== criteria.automation
      ) {
        return false;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const hasAllTags = criteria.tags.every((tag) =>
          tc.tags?.includes(tag)
        );
        if (!hasAllTags) return false;
      }

      if (criteria.searchText) {
        const searchLower = criteria.searchText.toLowerCase();
        const matchesTitle = tc.title.toLowerCase().includes(searchLower);
        const matchesDescription = tc.description
          ?.toLowerCase()
          .includes(searchLower);
        const matchesStep = tc.testSteps.some(
          (step) =>
            step.action.toLowerCase().includes(searchLower) ||
            step.expectedResult.toLowerCase().includes(searchLower)
        );
        if (!matchesTitle && !matchesDescription && !matchesStep) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Compare two test cases
   */
  static compare(
    oldCase: TestCase,
    newCase: TestCase
  ): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};

    if (oldCase.title !== newCase.title) {
      changes.title = { old: oldCase.title, new: newCase.title };
    }

    if (oldCase.description !== newCase.description) {
      changes.description = {
        old: oldCase.description,
        new: newCase.description,
      };
    }

    if (oldCase.priority !== newCase.priority) {
      changes.priority = { old: oldCase.priority, new: newCase.priority };
    }

    if (oldCase.automation !== newCase.automation) {
      changes.automation = { old: oldCase.automation, new: newCase.automation };
    }

    if (JSON.stringify(oldCase.tags) !== JSON.stringify(newCase.tags)) {
      changes.tags = { old: oldCase.tags, new: newCase.tags };
    }

    if (
      JSON.stringify(oldCase.testSteps) !== JSON.stringify(newCase.testSteps)
    ) {
      changes.testSteps = {
        old: oldCase.testSteps,
        new: newCase.testSteps,
      };
    }

    return changes;
  }
}
