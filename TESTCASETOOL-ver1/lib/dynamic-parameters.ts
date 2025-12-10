/**
 * Dynamic Parameters Utility
 * Handles parameter parsing, substitution, and data-driven test execution
 */

export interface Parameter {
  name: string;
  type: 'text' | 'number' | 'email' | 'url' | 'date';
  default?: string;
  description?: string;
}

export interface ParameterSet {
  [key: string]: string | number | boolean;
}

export interface DataRow {
  [key: string]: any;
}

/**
 * Extract parameters from text (e.g., ${username}, ${password})
 */
export function extractParameters(text: string): Parameter[] {
  const paramRegex = /\$\{([^}]+)\}/g;
  const matches = new Set<string>();
  let match;

  while ((match = paramRegex.exec(text)) !== null) {
    matches.add(match[1]);
  }

  return Array.from(matches).map((name) => ({
    name,
    type: 'text',
    description: `Parameter: ${name}`,
  }));
}

/**
 * Substitute parameters in text with values from a data set
 */
export function substituteParameters(
  text: string,
  parameters: ParameterSet
): string {
  let result = text;

  for (const [key, value] of Object.entries(parameters)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(regex, String(value));
  }

  return result;
}

/**
 * Parse CSV data and return array of parameter sets
 */
export function parseCSV(csvContent: string): DataRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: DataRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: DataRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Parse JSON data and return array of parameter sets
 */
export function parseJSON(jsonContent: string): DataRow[] {
  try {
    const data = JSON.parse(jsonContent);
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error('Invalid JSON:', e);
    return [];
  }
}

/**
 * Detect parameters in a test case object and return all unique parameters
 */
export function detectTestCaseParameters(testCase: any): Parameter[] {
  const allParameters = new Set<string>();

  // Check title and description
  if (testCase.title) {
    extractParameters(testCase.title).forEach((p) =>
      allParameters.add(p.name)
    );
  }
  if (testCase.description) {
    extractParameters(testCase.description).forEach((p) =>
      allParameters.add(p.name)
    );
  }

  // Check all test steps
  if (testCase.testSteps && Array.isArray(testCase.testSteps)) {
    testCase.testSteps.forEach((step: any) => {
      if (step.action) {
        extractParameters(step.action).forEach((p) =>
          allParameters.add(p.name)
        );
      }
      if (step.expectedResult) {
        extractParameters(step.expectedResult).forEach((p) =>
          allParameters.add(p.name)
        );
      }
    });
  }

  return Array.from(allParameters).map((name) => ({
    name,
    type: 'text',
    description: `Parameter: ${name}`,
  }));
}

/**
 * Substitute parameters in a test case with values from a data set
 */
export function substituteTestCaseParameters(
  testCase: any,
  parameters: ParameterSet
): any {
  return {
    ...testCase,
    title: substituteParameters(testCase.title || '', parameters),
    description: substituteParameters(testCase.description || '', parameters),
    testSteps: (testCase.testSteps || []).map((step: any) => ({
      ...step,
      action: substituteParameters(step.action || '', parameters),
      expectedResult: substituteParameters(step.expectedResult || '', parameters),
    })),
  };
}

/**
 * Generate test case variants for each row of data
 */
export function generateDataDrivenVariants(
  testCase: any,
  dataRows: DataRow[]
): Array<{ variant: any; dataRow: DataRow }> {
  return dataRows.map((row) => ({
    variant: substituteTestCaseParameters(testCase, row as ParameterSet),
    dataRow: row,
  }));
}
