/**
 * Duplicate Detection Utility
 * Detects similar test cases to prevent duplicates
 */

import { TestCase } from '@/types';

export interface SimilarityResult {
  testCase: TestCase;
  similarity: number; // 0-100
  reason: string; // Why they're similar
}

/**
 * Calculate similarity between two strings (0-100)
 * Uses Levenshtein distance algorithm
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.includes(shorter)) {
    return Math.round((shorter.length / longer.length) * 100);
  }

  const editDistance = getLevenshteinDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function getLevenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
}

/**
 * Find similar test cases
 */
export function findSimilarTestCases(
  newTestCase: TestCase,
  existingTestCases: TestCase[],
  threshold: number = 75 // Similarity threshold (0-100)
): SimilarityResult[] {
  const results: SimilarityResult[] = [];

  existingTestCases.forEach((existing) => {
    // Compare titles
    const titleSimilarity = calculateStringSimilarity(
      newTestCase.title || '',
      existing.title || ''
    );

    // Compare descriptions
    const descriptionSimilarity = calculateStringSimilarity(
      newTestCase.description || '',
      existing.description || ''
    );

    // Compare steps
    const newStepsText = (newTestCase.testSteps || [])
      .map((s) => s.action + ' ' + s.expectedResult)
      .join(' ');
    const existingStepsText = (existing.testSteps || [])
      .map((s) => s.action + ' ' + s.expectedResult)
      .join(' ');
    const stepsSimilarity = calculateStringSimilarity(newStepsText, existingStepsText);

    // Weighted average: title (40%), description (30%), steps (30%)
    const overallSimilarity = Math.round(
      titleSimilarity * 0.4 +
        descriptionSimilarity * 0.3 +
        stepsSimilarity * 0.3
    );

    if (overallSimilarity >= threshold) {
      let reason = '';
      if (titleSimilarity > 80) {
        reason = 'Similar title';
      } else if (descriptionSimilarity > 80) {
        reason = 'Similar description';
      } else if (stepsSimilarity > 80) {
        reason = 'Similar test steps';
      } else {
        reason = 'Overall similarity';
      }

      results.push({
        testCase: existing,
        similarity: overallSimilarity,
        reason,
      });
    }
  });

  // Sort by similarity (highest first)
  return results.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Check if a test case is a duplicate (high similarity)
 */
export function isDuplicate(
  newTestCase: TestCase,
  existingTestCases: TestCase[],
  threshold: number = 85
): boolean {
  const similar = findSimilarTestCases(newTestCase, existingTestCases, threshold);
  return similar.length > 0;
}

/**
 * Get duplicate warning message
 */
export function getDuplicateWarning(
  newTestCase: TestCase,
  existingTestCases: TestCase[]
): string | null {
  const similar = findSimilarTestCases(newTestCase, existingTestCases, 75);

  if (similar.length === 0) {
    return null;
  }

  const topMatch = similar[0];
  return `⚠️ Similar test case found: "${topMatch.testCase.title}" (${topMatch.similarity}% match) - ${topMatch.reason}`;
}

/**
 * Suggest merging or linking related test cases
 */
export function suggestMerges(
  newTestCase: TestCase,
  existingTestCases: TestCase[],
  threshold: number = 80
): SimilarityResult[] {
  return findSimilarTestCases(newTestCase, existingTestCases, threshold);
}
