/**
 * Bulk Import/Export Utility
 * Handles importing and exporting test cases in various formats (JSON, CSV, Excel)
 */

import { TestCase, TestStep } from '@/types';

export interface ImportOptions {
  format: 'json' | 'csv' | 'excel';
  data: string; // File content as string
}

export interface ExportOptions {
  format: 'json' | 'csv';
}

/**
 * Export test cases to JSON format
 */
export function exportToJSON(testCases: TestCase[]): string {
  return JSON.stringify(testCases, null, 2);
}

/**
 * Export test cases to CSV format
 */
export function exportToCSV(testCases: TestCase[]): string {
  const headers = ['Title', 'Description', 'Steps', 'Tags', 'Priority', 'Automation'];
  const rows = testCases.map((tc) => [
    `"${(tc.title || '').replace(/"/g, '""')}"`,
    `"${(tc.description || '').replace(/"/g, '""')}"`,
    `"${formatStepsForCSV(tc.testSteps).replace(/"/g, '""')}"`,
    `"${(tc.tags || []).join('; ')}"`,
    tc.priority || '2',
    tc.automationStatus || 'Not Automated',
  ]);

  const headerLine = headers.join(',');
  const dataLines = rows.map((row) => row.join(','));

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Format test steps for CSV export
 */
function formatStepsForCSV(steps: TestStep[]): string {
  return steps
    .map(
      (step, idx) =>
        `Step ${idx + 1}: Action: ${step.action}; Expected: ${step.expectedResult}`
    )
    .join(' | ');
}

/**
 * Import test cases from JSON format
 */
export function importFromJSON(jsonContent: string): TestCase[] {
  try {
    const data = JSON.parse(jsonContent);
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

/**
 * Import test cases from CSV format
 */
export function importFromCSV(csvContent: string): TestCase[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have header row and at least one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const testCases: TestCase[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: { [key: string]: string } = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    const testCase = rowToTestCase(row);
    testCases.push(testCase);
  }

  return testCases;
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Convert a CSV row to a TestCase object
 */
function rowToTestCase(row: { [key: string]: string }): TestCase {
  const steps = parseStepsFromCSV(row['Steps'] || '');

  return {
    title: row['Title'] || 'Untitled',
    description: row['Description'] || '',
    testSteps: steps,
    tags: (row['Tags'] || '').split(';').map((t) => t.trim()).filter(Boolean),
    priority: parseInt(row['Priority'] || '2'),
    automationStatus: row['Automation'] || 'Not Automated',
  };
}

/**
 * Parse steps from CSV format
 */
function parseStepsFromCSV(stepsStr: string): TestStep[] {
  if (!stepsStr) return [];

  const stepPattern = /Step \d+: Action: ([^;]*); Expected: ([^|]*)/g;
  const steps: TestStep[] = [];
  let match;
  let order = 1;

  while ((match = stepPattern.exec(stepsStr)) !== null) {
    steps.push({
      action: match[1].trim(),
      expectedResult: match[2].trim(),
      order,
      attachments: [],
    });
    order++;
  }

  return steps;
}

/**
 * Validate test cases before import
 */
export function validateTestCases(testCases: TestCase[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  testCases.forEach((tc, idx) => {
    if (!tc.title || !tc.title.trim()) {
      errors.push(`Test case ${idx + 1}: Missing title`);
    }
    if (!tc.testSteps || tc.testSteps.length === 0) {
      errors.push(`Test case ${idx + 1}: Missing test steps`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export test cases in the specified format
 */
export function exportTestCases(
  testCases: TestCase[],
  format: 'json' | 'csv'
): string {
  if (format === 'json') {
    return exportToJSON(testCases);
  } else if (format === 'csv') {
    return exportToCSV(testCases);
  }
  throw new Error(`Unsupported export format: ${format}`);
}

/**
 * Import test cases from the specified format
 */
export function importTestCases(
  content: string,
  format: 'json' | 'csv'
): TestCase[] {
  if (format === 'json') {
    return importFromJSON(content);
  } else if (format === 'csv') {
    return importFromCSV(content);
  }
  throw new Error(`Unsupported import format: ${format}`);
}
