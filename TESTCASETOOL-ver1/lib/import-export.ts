import { TestCase, ImportExportOptions } from '@/types';

export class ImportExportService {
  /**
   * Export test cases to JSON format
   */
  static exportToJSON(
    testCases: TestCase[],
    options: ImportExportOptions = {
      format: 'json',
      includeAttachments: true,
      includeTestRuns: false,
    }
  ): string {
    const data = testCases.map((tc) => {
      const exportCase: any = {
        title: tc.title,
        description: tc.description,
        testSteps: tc.testSteps,
        priority: tc.priority,
        automation: tc.automation,
        tags: tc.tags,
      };

      if (options.includeAttachments && tc.attachments) {
        exportCase.attachments = tc.attachments;
      }

      return exportCase;
    });

    return JSON.stringify(data, null, 2);
  }

  /**
   * Export test cases to CSV format
   */
  static exportToCSV(testCases: TestCase[]): string {
    const headers = [
      'Title',
      'Description',
      'Priority',
      'Automation Status',
      'Tags',
      'Number of Steps',
      'Step 1 Action',
      'Step 1 Expected',
    ];

    let csv = headers.join(',') + '\n';

    testCases.forEach((tc) => {
      const row = [
        this.escapeCsv(tc.title),
        this.escapeCsv(tc.description || ''),
        tc.priority || '',
        tc.automation || 'Not Automated',
        tc.tags?.join(';') || '',
        tc.testSteps.length,
        this.escapeCsv(tc.testSteps[0]?.action || ''),
        this.escapeCsv(tc.testSteps[0]?.expectedResult || ''),
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Export test cases to RAW text format
   */
  static exportToRAW(testCases: TestCase[]): string {
    return testCases
      .map((tc, index) => {
        let raw = '';

        if (index > 0) raw += '\n---\n\n';

        raw += `Title: ${tc.title}\n`;
        if (tc.description) raw += `Description: ${tc.description}\n`;
        if (tc.priority) raw += `Priority: ${tc.priority}\n`;
        if (tc.automation) raw += `Automation: ${tc.automation}\n`;
        if (tc.tags?.length) raw += `Tags: ${tc.tags.join(', ')}\n`;

        if (tc.testSteps.length > 0) {
          raw += '\nSteps:\n';
          tc.testSteps.forEach((step, stepIndex) => {
            raw += `\nStep ${stepIndex + 1}:\n`;
            raw += `  Action: ${step.action}\n`;
            if (step.expectedResult)
              raw += `  Expected: ${step.expectedResult}\n`;
            if (step.testData) raw += `  Data: ${step.testData}\n`;
          });
        }

        return raw;
      })
      .join('\n');
  }

  /**
   * Import test cases from JSON
   */
  static importFromJSON(jsonText: string): TestCase[] {
    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data)) {
        throw new Error('JSON must be an array of test cases');
      }

      return data.map((item: any) => ({
        title: item.title || '',
        description: item.description || '',
        testSteps: item.testSteps || [],
        tags: item.tags || [],
        priority: item.priority,
        automation: item.automation || 'Not Automated',
        attachments: item.attachments,
      }));
    } catch (error) {
      throw new Error(
        `Failed to import JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Import test cases from CSV
   */
  static importFromCSV(csvText: string): TestCase[] {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const testCases: TestCase[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      testCases.push({
        title: row['title'] || `Test Case ${i}`,
        description: row['description'],
        priority: parseInt(row['priority'] || '2'),
        automation: (row['automation status'] || 'Not Automated') as any,
        tags: row['tags']?.split(';').map((t) => t.trim()) || [],
        testSteps: row['step 1 action']
          ? [
              {
                action: row['step 1 action'],
                expectedResult: row['step 1 expected'],
                order: 1,
              },
            ]
          : [],
      });
    }

    return testCases;
  }

  /**
   * Download file to user's machine
   */
  static downloadFile(content: string, filename: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Helper: Escape CSV values
   */
  private static escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Helper: Parse CSV line
   */
  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }
}
