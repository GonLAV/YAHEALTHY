/**
 * Search & Filter Utility
 * Provides fast searching and filtering of test cases
 */

import { TestCase } from '@/types';

export interface SearchFilters {
  keyword?: string;
  priority?: number;
  automationStatus?: string;
  tags?: string[];
  archived?: boolean;
}

export interface SearchResult {
  testCase: TestCase;
  relevance: number; // 0-100
  matchedFields: string[];
}

/**
 * Search test cases by keyword across title, description, and tags
 */
export function searchTestCases(
  testCases: TestCase[],
  keyword: string
): SearchResult[] {
  if (!keyword || keyword.trim().length === 0) {
    return testCases.map((tc) => ({ testCase: tc, relevance: 100, matchedFields: [] }));
  }

  const lowerKeyword = keyword.toLowerCase();
  const results: SearchResult[] = [];

  testCases.forEach((tc) => {
    const matchedFields: string[] = [];
    let relevance = 0;

    // Check title (highest weight)
    if (tc.title?.toLowerCase().includes(lowerKeyword)) {
      matchedFields.push('title');
      relevance += 50;
    }

    // Check description
    if (tc.description?.toLowerCase().includes(lowerKeyword)) {
      matchedFields.push('description');
      relevance += 30;
    }

    // Check tags
    if (tc.tags?.some((tag) => tag.toLowerCase().includes(lowerKeyword))) {
      matchedFields.push('tags');
      relevance += 20;
    }

    // Check test steps
    if (
      tc.testSteps?.some(
        (step) =>
          step.action?.toLowerCase().includes(lowerKeyword) ||
          step.expectedResult?.toLowerCase().includes(lowerKeyword)
      )
    ) {
      matchedFields.push('steps');
      relevance += 15;
    }

    if (relevance > 0) {
      results.push({ testCase: tc, relevance, matchedFields });
    }
  });

  // Sort by relevance
  return results.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Filter test cases by criteria
 */
export function filterTestCases(
  testCases: TestCase[],
  filters: SearchFilters
): TestCase[] {
  return testCases.filter((tc) => {
    if (
      filters.priority !== undefined &&
      tc.priority !== filters.priority
    ) {
      return false;
    }

    if (
      filters.automationStatus &&
      tc.automationStatus !== filters.automationStatus
    ) {
      return false;
    }

    if (filters.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every((tag) =>
        tc.tags?.includes(tag)
      );
      if (!hasAllTags) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Combined search and filter
 */
export function searchAndFilter(
  testCases: TestCase[],
  keyword?: string,
  filters?: SearchFilters
): SearchResult[] {
  // First filter by criteria
  let filtered = filters ? filterTestCases(testCases, filters) : testCases;

  // Then search by keyword
  return keyword ? searchTestCases(filtered, keyword) : filtered.map((tc) => ({ testCase: tc, relevance: 100, matchedFields: [] }));
}

/**
 * Parse advanced search syntax
 */
export function parseSearchSyntax(query: string): SearchFilters {
  const filters: SearchFilters = {};
  const parts = query.split(/\s+/);

  parts.forEach((part) => {
    if (part.startsWith('title:')) {
      // Extract quoted phrases like title:"Login Test"
      const match = query.match(/title:"([^"]*)"/);
      if (match) {
        filters.keyword = match[1];
      }
    } else if (part.startsWith('tag:')) {
      const tag = part.substring(4);
      filters.tags = [...(filters.tags || []), tag];
    } else if (part.startsWith('priority:')) {
      filters.priority = parseInt(part.substring(9));
    } else if (part === 'automated') {
      filters.automationStatus = 'Automated';
    } else if (part === 'manual') {
      filters.automationStatus = 'Manual';
    }
  });

  return filters;
}

/**
 * Get suggestions based on partial input
 */
export function getSearchSuggestions(
  testCases: TestCase[],
  partial: string
): string[] {
  const lowerPartial = partial.toLowerCase();
  const suggestions = new Set<string>();

  testCases.forEach((tc) => {
    if (tc.title?.toLowerCase().startsWith(lowerPartial)) {
      suggestions.add(tc.title);
    }
    tc.tags?.forEach((tag) => {
      if (tag.toLowerCase().startsWith(lowerPartial)) {
        suggestions.add(`tag:${tag}`);
      }
    });
  });

  return Array.from(suggestions).slice(0, 10);
}
