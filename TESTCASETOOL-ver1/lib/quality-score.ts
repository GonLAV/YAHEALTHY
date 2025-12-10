/**
 * Smart Test Case Quality Score Calculator
 * Validates test case quality and provides real-time feedback
 */

import { TestCase, TestStep } from '@/types';

export interface QualityScoreResult {
  score: number; // 0-100
  category: 'Poor' | 'Fair' | 'Good' | 'Excellent';
  warnings: QualityWarning[];
  suggestions: string[];
}

export interface QualityWarning {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  penalty: number;
  field?: string;
}

export class QualityScoreCalculator {
  /**
   * Calculate quality score for a test case (0-100)
   */
  static calculateScore(testCase: TestCase): QualityScoreResult {
    let baseScore = 100;
    const warnings: QualityWarning[] = [];
    const suggestions: string[] = [];

    // Rule 1: Title missing → -20
    if (!testCase.title || testCase.title.trim().length === 0) {
      warnings.push({
        code: 'MISSING_TITLE',
        severity: 'critical',
        message: 'Test case title is required',
        penalty: 20,
        field: 'title',
      });
      baseScore -= 20;
      suggestions.push('Add a clear, descriptive title for the test case');
    }

    // Rule 2: Description missing → -10
    if (!testCase.description || testCase.description.trim().length === 0) {
      warnings.push({
        code: 'MISSING_DESCRIPTION',
        severity: 'warning',
        message: 'Test case description is recommended',
        penalty: 10,
        field: 'description',
      });
      baseScore -= 10;
      suggestions.push('Add a description explaining what this test case validates');
    }

    // Rule 3: No expected results → -15
    const stepsWithoutExpected = (testCase.testSteps || []).filter(
      (step) => !step.expectedResult || step.expectedResult.trim().length === 0
    );

    if (stepsWithoutExpected.length > 0) {
      warnings.push({
        code: 'MISSING_EXPECTED_RESULTS',
        severity: 'warning',
        message: `${stepsWithoutExpected.length} step(s) missing expected results`,
        penalty: 15,
        field: 'testSteps',
      });
      baseScore -= 15;
      suggestions.push(
        'Every step should have a clear expected result to validate'
      );
    }

    // Rule 4: No test data / parameters → -10
    const stepsWithoutData = (testCase.testSteps || []).filter(
      (step) => !step.testData
    );

    if (stepsWithoutData.length === testCase.testSteps?.length) {
      warnings.push({
        code: 'NO_TEST_DATA',
        severity: 'info',
        message: 'Test data / parameters can make tests more robust',
        penalty: 10,
        field: 'testSteps',
      });
      baseScore -= 10;
      suggestions.push(
        'Consider adding test data or parameters (e.g., ${username}, ${password}) to steps'
      );
    }

    // Rule 5: Lengthy step (>300 chars) → -5 per step
    const longSteps = (testCase.testSteps || []).filter(
      (step) => (step.action?.length || 0) + (step.expectedResult?.length || 0) > 300
    );

    if (longSteps.length > 0) {
      warnings.push({
        code: 'LENGTHY_STEPS',
        severity: 'warning',
        message: `${longSteps.length} step(s) exceed 300 characters`,
        penalty: 5 * longSteps.length,
        field: 'testSteps',
      });
      baseScore -= 5 * longSteps.length;
      suggestions.push(
        'Break long steps into smaller, more focused steps for clarity'
      );
    }

    // Rule 6: Steps < 2 → -10
    if (!testCase.testSteps || testCase.testSteps.length < 2) {
      warnings.push({
        code: 'INSUFFICIENT_STEPS',
        severity: 'warning',
        message: 'Test case should have at least 2 steps',
        penalty: 10,
        field: 'testSteps',
      });
      baseScore -= 10;
      suggestions.push('Add more detailed steps to properly test the functionality');
    }

    // Rule 7: Duplicate similarity > 70% → -20
    // (This would be checked against other test cases in parent)
    // For now, we provide the framework

    // Bonus points for good practices
    if (testCase.tags && testCase.tags.length > 0) {
      baseScore = Math.min(100, baseScore + 5);
      suggestions.push('✓ Good: Test case has meaningful tags');
    }

    if (testCase.priority) {
      baseScore = Math.min(100, baseScore + 3);
      suggestions.push('✓ Good: Test case has priority assigned');
    }

    if (testCase.precondition && testCase.precondition.trim().length > 0) {
      baseScore = Math.min(100, baseScore + 3);
      suggestions.push('✓ Good: Preconditions are documented');
    }

    if (testCase.postCondition && testCase.postCondition.trim().length > 0) {
      baseScore = Math.min(100, baseScore + 3);
      suggestions.push('✓ Good: Postconditions are documented');
    }

    // Ensure score is between 0-100
    const finalScore = Math.max(0, Math.min(100, baseScore));

    // Determine category
    let category: 'Poor' | 'Fair' | 'Good' | 'Excellent';
    if (finalScore >= 90) {
      category = 'Excellent';
    } else if (finalScore >= 70) {
      category = 'Good';
    } else if (finalScore >= 50) {
      category = 'Fair';
    } else {
      category = 'Poor';
    }

    return {
      score: finalScore,
      category,
      warnings,
      suggestions,
    };
  }

  /**
   * Calculate similarity between two test cases (0-100%)
   * Returns percentage of similarity
   */
  static calculateSimilarity(
    testCase1: TestCase,
    testCase2: TestCase
  ): number {
    const similarities: number[] = [];

    // Title similarity
    const titleSimilarity = this.stringSimilarity(
      testCase1.title || '',
      testCase2.title || ''
    );
    similarities.push(titleSimilarity);

    // Description similarity
    const descSimilarity = this.stringSimilarity(
      testCase1.description || '',
      testCase2.description || ''
    );
    similarities.push(descSimilarity);

    // Steps similarity
    const steps1 = (testCase1.testSteps || [])
      .map((s) => s.action)
      .join(' ');
    const steps2 = (testCase2.testSteps || [])
      .map((s) => s.action)
      .join(' ');
    const stepsSimilarity = this.stringSimilarity(steps1, steps2);
    similarities.push(stepsSimilarity);

    // Average similarity
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

    return Math.round(avgSimilarity);
  }

  /**
   * Levenshtein distance-based string similarity
   * Returns 0-100% similarity
   */
  private static stringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 100;

    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 100;

    const distance = this.levenshteinDistance(s1, s2);
    const similarity = ((maxLen - distance) / maxLen) * 100;

    return Math.max(0, Math.min(100, Math.round(similarity)));
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get color for quality score
   */
  static getScoreColor(score: number): string {
    if (score >= 90) return '#10B981'; // Excellent - green
    if (score >= 70) return '#3B82F6'; // Good - blue
    if (score >= 50) return '#F59E0B'; // Fair - amber
    return '#EF4444'; // Poor - red
  }

  /**
   * Get icon for quality category
   */
  static getCategoryIcon(category: string): string {
    switch (category) {
      case 'Excellent':
        return '⭐⭐⭐⭐⭐';
      case 'Good':
        return '⭐⭐⭐⭐';
      case 'Fair':
        return '⭐⭐⭐';
      case 'Poor':
        return '⭐⭐';
      default:
        return '⭐';
    }
  }
}
