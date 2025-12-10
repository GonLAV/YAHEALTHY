/**
 * Migration Assistant for Test Cases
 * Import and normalize test cases from Excel, CSV, JSON
 */

import Papa from 'papaparse';
import { TestCase, TestStep } from '@/types';

export interface MigrationResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: MigrationError[];
  testCases: TestCase[];
}

export interface MigrationError {
  row: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface MigrationConfig {
  format: 'json' | 'csv' | 'excel';
  titleColumn?: string;
  descriptionColumn?: string;
  stepsColumn?: string;
  tagsColumn?: string;
  priorityColumn?: string;
  validateRequired?: boolean;
}

export class MigrationAssistant {
  /**
   * Import test cases from file
   */
  static async importFromFile(
    file: File,
    config: MigrationConfig
  ): Promise<MigrationResult> {
    try {
      let data: any;

      if (config.format === 'json') {
        data = await this.parseJsonFile(file);
      } else if (config.format === 'csv') {
        data = await this.parseCsvFile(file);
      } else if (config.format === 'excel') {
        // Would require xlsx library
        throw new Error('Excel format requires additional library (xlsx)');
      }

      return this.processData(data, config);
    } catch (error) {
      console.error('[MigrationAssistant] Import failed:', error);
      return {
        success: false,
        imported: 0,
        failed: 1,
        errors: [
          {
            row: 0,
            message: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error',
          },
        ],
        testCases: [],
      };
    }
  }

  /**
   * Parse JSON file
   */
  private static async parseJsonFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          resolve(Array.isArray(data) ? data : [data]);
        } catch (error) {
          reject(new Error('Invalid JSON format'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Parse CSV file
   */
  private static async parseCsvFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          resolve(results.data);
        },
        error: (error: any) => {
          reject(new Error(`CSV parse error: ${error.message}`));
        },
      });
    });
  }

  /**
   * Process and normalize data into test cases
   */
  private static processData(
    data: any[],
    config: MigrationConfig
  ): MigrationResult {
    const errors: MigrationError[] = [];
    const testCases: TestCase[] = [];
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i];
        const testCase = this.normalizeRow(row, config, i + 1);

        // Validate required fields
        if (config.validateRequired) {
          const validation = this.validateTestCase(testCase);
          if (!validation.valid) {
            errors.push({
              row: i + 1,
              message: validation.errors.join(', '),
              severity: 'error',
            });
            failed++;
            continue;
          }
        }

        testCases.push(testCase);
        imported++;
      } catch (error) {
        errors.push({
          row: i + 1,
          message: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error',
        });
        failed++;
      }
    }

    return {
      success: failed === 0,
      imported,
      failed,
      errors,
      testCases,
    };
  }

  /**
   * Normalize a row into a TestCase
   */
  private static normalizeRow(row: any, config: MigrationConfig, rowNum: number): TestCase {
    const titleField = config.titleColumn || 'title' || 'Title';
    const descField = config.descriptionColumn || 'description' || 'Description';
    const stepsField = config.stepsColumn || 'steps' || 'Steps';
    const tagsField = config.tagsColumn || 'tags' || 'Tags';
    const priorityField = config.priorityColumn || 'priority' || 'Priority';

    // Parse title
    const title = this.getFieldValue(row, titleField);
    if (!title) {
      throw new Error('Missing title');
    }

    // Parse description
    const description = this.getFieldValue(row, descField) || '';

    // Parse steps
    const stepsData = this.getFieldValue(row, stepsField);
    const testSteps = this.parseSteps(stepsData);

    // Parse tags
    const tagsData = this.getFieldValue(row, tagsField) || '';
    const tags = tagsData
      .split(/[,;]/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);

    // Parse priority
    const priorityData = this.getFieldValue(row, priorityField);
    const priority = this.parsePriority(priorityData);

    return {
      title,
      description,
      testSteps,
      tags,
      priority,
      precondition: this.getFieldValue(row, 'precondition') || '',
      postCondition: this.getFieldValue(row, 'postcondition') || '',
      customFields: {},
    };
  }

  /**
   * Get field value from row (case-insensitive)
   */
  private static getFieldValue(row: any, fieldName: string): string {
    if (!row || typeof row !== 'object') return '';

    const key = Object.keys(row).find(
      (k) => k.toLowerCase() === fieldName.toLowerCase()
    );

    return key ? String(row[key] || '').trim() : '';
  }

  /**
   * Parse steps from string or array
   */
  private static parseSteps(stepsData: any): TestStep[] {
    if (!stepsData) return [];

    const steps: TestStep[] = [];

    // If it's a string, split by newline or numbered format
    if (typeof stepsData === 'string') {
      const lines = stepsData.split('\n');
      let currentStep: Partial<TestStep> | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Detect step number or "Step X:"
        if (/^Step\s+\d+:|^\d+\.|^-/.test(trimmed)) {
          if (currentStep && currentStep.action) {
            steps.push({
              order: steps.length + 1,
              action: currentStep.action,
              expectedResult: currentStep.expectedResult || '',
            });
          }

          // Start new step
          const action = trimmed.replace(/^(Step\s+\d+:|^\d+\.|^-)/, '').trim();
          currentStep = { action };
        } else if (currentStep) {
          // Add to expected result if no expected result yet
          if (!currentStep.expectedResult) {
            currentStep.expectedResult = trimmed;
          } else {
            currentStep.expectedResult += ' ' + trimmed;
          }
        }
      }

      // Add last step
      if (currentStep && currentStep.action) {
        steps.push({
          order: steps.length + 1,
          action: currentStep.action,
          expectedResult: currentStep.expectedResult || '',
        });
      }
    } else if (Array.isArray(stepsData)) {
      // If it's already an array, normalize each step
      stepsData.forEach((step, idx) => {
        if (typeof step === 'string') {
          steps.push({
            order: idx + 1,
            action: step,
            expectedResult: '',
          });
        } else if (typeof step === 'object' && step.action) {
          steps.push({
            order: idx + 1,
            action: step.action,
            expectedResult: step.expectedResult || step.expected || '',
            testData: step.testData || step.data,
          });
        }
      });
    }

    return steps;
  }

  /**
   * Parse priority (supports 1-4, High/Medium/Low)
   */
  private static parsePriority(priorityData: any): number | undefined {
    if (!priorityData) return undefined;

    const value = String(priorityData).toLowerCase().trim();

    // Numeric
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 4) {
      return num;
    }

    // Text
    if (value.includes('critical') || value.includes('high')) return 1;
    if (value.includes('medium')) return 2;
    if (value.includes('low')) return 3;
    if (value.includes('minimal')) return 4;

    return undefined;
  }

  /**
   * Validate test case has required fields
   */
  private static validateTestCase(testCase: TestCase): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!testCase.title || testCase.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!testCase.testSteps || testCase.testSteps.length === 0) {
      errors.push('At least one step is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export test cases to JSON
   */
  static exportToJson(testCases: TestCase[]): string {
    return JSON.stringify(testCases, null, 2);
  }

  /**
   * Export test cases to CSV
   */
  static exportToCsv(testCases: TestCase[]): string {
    const headers = ['Title', 'Description', 'Priority', 'Tags', 'Steps'];
    const rows = testCases.map((tc) => [
      `"${tc.title}"`,
      `"${tc.description || ''}"`,
      tc.priority || '',
      `"${tc.tags?.join('; ') || ''}"`,
      `"${tc.testSteps.map((s) => `${s.action} → ${s.expectedResult}`).join('; ')}"`,
    ]);

    return [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');
  }
}
