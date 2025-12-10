/**
 * AI-Assisted Test Case Suggestions
 * Suggests new test cases based on existing ones, risk areas, and patterns
 */

import { TestCase, TestStep } from '@/types';

export interface TestSuggestion {
  title: string;
  description: string;
  suggestedSteps: TestStep[];
  reason: string;
  confidence: number; // 0-100
  category: 'edge-case' | 'negative-test' | 'boundary' | 'performance' | 'security' | 'related';
}

export interface CoverageMetrics {
  totalRequirements: number;
  testedRequirements: number;
  coveragePercentage: number;
  uncoveredRequirements: string[];
  riskAreas: string[];
}

export interface PriorityRecommendation {
  testCaseId?: string;
  title: string;
  recommendedPriority: number; // 1-4
  reason: string;
  riskScore: number; // 0-100
  impactScore: number; // 0-100
}

/**
 * Extract keywords and patterns from test cases
 */
function extractPatterns(testCase: TestCase): string[] {
  const patterns: string[] = [];

  // Extract from title
  if (testCase.title) {
    const titleWords = testCase.title.toLowerCase().split(/\s+/);
    patterns.push(...titleWords.filter((w) => w.length > 3));
  }

  // Extract from tags
  if (testCase.tags) {
    patterns.push(...testCase.tags.map((t) => t.toLowerCase()));
  }

  // Extract from steps
  if (testCase.testSteps) {
    testCase.testSteps.forEach((step) => {
      const actionWords = (step.action || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      patterns.push(...actionWords);
    });
  }

  return [...new Set(patterns)];
}

/**
 * Suggest edge case test cases
 */
function suggestEdgeCases(testCase: TestCase): TestSuggestion[] {
  const suggestions: TestSuggestion[] = [];

  // Edge case: empty/null values
  suggestions.push({
    title: `${testCase.title} - with empty input`,
    description: `Test ${testCase.title} with empty or null values`,
    suggestedSteps: [
      {
        action: 'Attempt to execute with empty input fields',
        expectedResult: 'System should handle gracefully or show validation error',
        order: 1,
        attachments: [],
      },
    ],
    reason: 'Edge case: handling empty/null values',
    confidence: 85,
    category: 'edge-case',
  });

  // Edge case: boundary values
  suggestions.push({
    title: `${testCase.title} - boundary values`,
    description: `Test ${testCase.title} with boundary or extreme values`,
    suggestedSteps: [
      {
        action: 'Test with maximum/minimum allowed values',
        expectedResult: 'System should process correctly at boundaries',
        order: 1,
        attachments: [],
      },
    ],
    reason: 'Edge case: boundary value testing',
    confidence: 80,
    category: 'boundary',
  });

  return suggestions;
}

/**
 * Suggest negative test cases
 */
function suggestNegativeTests(testCase: TestCase): TestSuggestion[] {
  const suggestions: TestSuggestion[] = [];

  suggestions.push({
    title: `${testCase.title} - negative test`,
    description: `Negative test for ${testCase.title}`,
    suggestedSteps: [
      {
        action: 'Attempt to execute with invalid data',
        expectedResult: 'System should reject the invalid input',
        order: 1,
        attachments: [],
      },
    ],
    reason: 'Negative test case for error handling',
    confidence: 90,
    category: 'negative-test',
  });

  return suggestions;
}

/**
 * Suggest security-focused test cases
 */
function suggestSecurityTests(testCase: TestCase): TestSuggestion[] {
  const suggestions: TestSuggestion[] = [];
  const titleLower = testCase.title?.toLowerCase() || '';

  // If it's related to login or authentication
  if (titleLower.includes('login') || titleLower.includes('auth')) {
    suggestions.push({
      title: `${testCase.title} - SQL injection prevention`,
      description: `Security test for SQL injection vulnerabilities`,
      suggestedSteps: [
        {
          action: 'Enter SQL injection payload in input fields',
          expectedResult: 'System should safely escape or reject the input',
          order: 1,
          attachments: [],
        },
      ],
      reason: 'Security: SQL injection testing',
      confidence: 75,
      category: 'security',
    });

    suggestions.push({
      title: `${testCase.title} - brute force protection`,
      description: `Security test for brute force attack protection`,
      suggestedSteps: [
        {
          action: 'Attempt multiple failed login attempts',
          expectedResult: 'Account should be locked or rate-limited',
          order: 1,
          attachments: [],
        },
      ],
      reason: 'Security: brute force protection',
      confidence: 85,
      category: 'security',
    });
  }

  return suggestions;
}

/**
 * Generate test case suggestions based on existing test cases
 */
export function generateTestSuggestions(
  existingTestCases: TestCase[],
  limit: number = 10
): TestSuggestion[] {
  const suggestions: TestSuggestion[] = [];

  existingTestCases.forEach((testCase) => {
    // Add edge cases
    suggestions.push(...suggestEdgeCases(testCase));

    // Add negative tests
    suggestions.push(...suggestNegativeTests(testCase));

    // Add security tests
    suggestions.push(...suggestSecurityTests(testCase));
  });

  // Sort by confidence and take top suggestions
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Analyze test coverage based on tags and features
 */
export function analyzeCoverage(
  testCases: TestCase[],
  allRequirements: string[] = []
): CoverageMetrics {
  const allTags = new Set<string>();
  const testedTags = new Set<string>();

  testCases.forEach((tc) => {
    if (tc.tags) {
      tc.tags.forEach((tag) => testedTags.add(tag));
    }
  });

  // Use provided requirements or extract from test case tags
  const requirements = allRequirements.length > 0 ? allRequirements : Array.from(testedTags);
  const uncoveredRequirements = requirements.filter(
    (req) => !testedTags.has(req)
  );

  // Identify high-risk areas (features with few test cases)
  const tagCounts = new Map<string, number>();
  testCases.forEach((tc) => {
    if (tc.tags) {
      tc.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    }
  });

  const riskAreas = Array.from(tagCounts.entries())
    .filter(([, count]) => count <= 2)
    .map(([tag]) => tag);

  return {
    totalRequirements: requirements.length,
    testedRequirements: testedTags.size,
    coveragePercentage: Math.round(
      (testedTags.size / Math.max(requirements.length, 1)) * 100
    ),
    uncoveredRequirements,
    riskAreas,
  };
}

/**
 * Get priority recommendations for test execution
 */
export function getPriorityRecommendations(
  testCases: TestCase[]
): PriorityRecommendation[] {
  const recommendations: PriorityRecommendation[] = [];

  testCases.forEach((tc) => {
    let riskScore = 50; // baseline
    let impactScore = 50; // baseline
    const reasons: string[] = [];

    // Increase risk if test is marked critical
    if (tc.tags?.some((tag) => tag.toLowerCase().includes('critical'))) {
      riskScore += 30;
      reasons.push('Tagged as critical');
    }

    // Increase risk if test is for core feature
    if (tc.tags?.some((tag) => tag.toLowerCase().includes('core'))) {
      riskScore += 25;
      reasons.push('Core feature test');
    }

    // Recent bugs impact priority
    if (tc.tags?.some((tag) => tag.toLowerCase().includes('regression'))) {
      riskScore += 20;
      impactScore += 15;
      reasons.push('Regression test');
    }

    // Security-related tests should be high priority
    if (tc.tags?.some((tag) => tag.toLowerCase().includes('security'))) {
      riskScore += 25;
      reasons.push('Security test');
    }

    // Integration tests often catch more issues
    if (tc.tags?.some((tag) => tag.toLowerCase().includes('integration'))) {
      impactScore += 20;
      reasons.push('Integration test');
    }

    // Cap scores at 100
    riskScore = Math.min(100, riskScore);
    impactScore = Math.min(100, impactScore);

    // Calculate priority (1-4) based on combined score
    const combinedScore = (riskScore + impactScore) / 2;
    let recommendedPriority = 2;

    if (combinedScore >= 80) {
      recommendedPriority = 1; // Run first
    } else if (combinedScore >= 60) {
      recommendedPriority = 2; // Run early
    } else if (combinedScore >= 40) {
      recommendedPriority = 3; // Run later
    } else {
      recommendedPriority = 4; // Run last
    }

    recommendations.push({
      title: tc.title || 'Untitled',
      recommendedPriority,
      reason: reasons.join('; ') || 'Based on test characteristics',
      riskScore,
      impactScore,
    });
  });

  // Sort by recommended priority (1 first)
  return recommendations.sort((a, b) => a.recommendedPriority - b.recommendedPriority);
}

/**
 * Detect common patterns in test cases
 */
export function detectTestPatterns(testCases: TestCase[]): Map<string, number> {
  const patterns = new Map<string, number>();

  testCases.forEach((tc) => {
    const allPatterns = extractPatterns(tc);
    allPatterns.forEach((pattern) => {
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    });
  });

  // Filter to patterns that appear in multiple test cases
  return new Map(
    Array.from(patterns.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
  );
}

/**
 * Suggest related test cases for a given test case
 */
export function suggestRelatedTests(
  testCase: TestCase,
  allTestCases: TestCase[]
): TestSuggestion[] {
  const patterns = extractPatterns(testCase);
  const relatedTestCases = new Map<string, number>();

  allTestCases.forEach((other) => {
    if (other === testCase) return;

    const otherPatterns = extractPatterns(other);
    let matches = 0;

    patterns.forEach((pattern) => {
      if (otherPatterns.includes(pattern)) {
        matches++;
      }
    });

    if (matches > 0) {
      relatedTestCases.set(other.title || 'Untitled', matches);
    }
  });

  // Return top related tests as suggestions
  return Array.from(relatedTestCases.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([title, matches]) => ({
      title: `Related: ${title}`,
      description: `Similar to ${testCase.title}`,
      suggestedSteps: [],
      reason: `${matches} pattern matches with "${testCase.title}"`,
      confidence: Math.min(100, 50 + matches * 15),
      category: 'related',
    }));
}
