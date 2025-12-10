import { TestCase, TestStep, RawTestCaseData, RawStep } from '@/types';

export class RawEditorParser {
  /**
   * Parse raw text into a TestCase object
   * Format: x-www-form-urlencoded style with key: value pairs
   * Lines starting with // are treated as disabled (skipped)
   * Empty lines separate steps
   * 
   * Example:
   * title: Login Test
   * description: Test login functionality
   * 
   * action: Click login button
   * expected: User is logged in
   * 
   * action: Navigate to home
   * expected: Home page displays
   * 
   * // action: This step is disabled
   * // expected: Disabled expected
   */
  static parseRawText(rawText: string): TestCase {
    const testCase: TestCase = {
      title: '',
      description: '',
      testSteps: [],
      tags: [],
      precondition: '',
      postCondition: '',
      customFields: {},
    };

    const lines = rawText.split('\n');
    let currentStep: { action: string; expectedResult: string; testData?: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line = end of current step
      if (!trimmed) {
        if (currentStep && currentStep.action) {
          testCase.testSteps.push({
            order: testCase.testSteps.length + 1,
            action: currentStep.action,
            expectedResult: currentStep.expectedResult || '',
            testData: currentStep.testData,
          });
        }
        currentStep = null;
        continue;
      }

      // Check if line is disabled
      const isDisabled = trimmed.startsWith('//');
      if (isDisabled) continue; // Skip disabled lines

      const cleanLine = trimmed;

      // Parse key: value format
      const colonIndex = cleanLine.indexOf(':');
      if (colonIndex > 0) {
        const key = cleanLine.substring(0, colonIndex).trim().toLowerCase();
        const value = cleanLine.substring(colonIndex + 1).trim();

        // Metadata fields
        if (key === 'title' || key === 'name') {
          testCase.title = value;
        } else if (key === 'description') {
          testCase.description = value;
        } else if (key === 'precondition') {
          testCase.precondition = value;
        } else if (key === 'postcondition') {
          testCase.postCondition = value;
        } else if (key === 'tags' || key === 'tag') {
          testCase.tags = value.split(',').map((t) => t.trim());
        } else if (key === 'priority') {
          testCase.priority = parseInt(value, 10);
        } else if (key === 'automation' || key === 'automationstatus') {
          testCase.automation = value as any;
        } else if (key === 'assignedto' || key === 'owner') {
          testCase.owner = value;
        } else if (key === 'areapath' || key === 'area') {
          testCase.areaPath = value;
        } else if (key === 'iterationpath' || key === 'iteration') {
          testCase.iterationPath = value;
        }
        // Step fields
        else if (key === 'action') {
          // If we have a previous step, save it
          if (currentStep && currentStep.action) {
            testCase.testSteps.push({
              order: testCase.testSteps.length + 1,
              action: currentStep.action,
              expectedResult: currentStep.expectedResult || '',
              testData: currentStep.testData,
            });
          }
          // Start new step
          currentStep = { action: value, expectedResult: '', testData: '' };
        } else if (key === 'expected' || key === 'expectedresult') {
          if (!currentStep) {
            currentStep = { action: '', expectedResult: value, testData: '' };
          } else {
            currentStep.expectedResult = value;
          }
        } else if (key === 'data' || key === 'testdata') {
          if (!currentStep) {
            currentStep = { action: '', expectedResult: '', testData: value };
          } else {
            currentStep.testData = value;
          }
        } else {
          // Custom field
          testCase.customFields![key] = value;
        }
      }
    }

    // Add last step if exists
    if (currentStep && currentStep.action) {
      testCase.testSteps.push({
        order: testCase.testSteps.length + 1,
        action: currentStep.action,
        expectedResult: currentStep.expectedResult || '',
        testData: currentStep.testData,
      });
    }

    // If no steps found, add defaults
    this.ensureDefaultSteps(testCase);

    return testCase;
  }

    // Ensure there are default steps if none provided
    private static ensureDefaultSteps(testCase: TestCase): void {
      if (!testCase.testSteps || testCase.testSteps.length === 0) {
        testCase.testSteps = [];
        for (let i = 1; i <= 10; i++) {
          testCase.testSteps.push({
            order: i,
            action: `Step ${i} action (default)`,
            expectedResult: `Step ${i} expected result (default)`,
          } as any);
        }
      }
    }

  private static parseMetadataLine(
    line: string,
    testCase: TestCase,
    isDisabled: boolean
  ): void {
    // Try JSON format
    try {
      const parsed = JSON.parse(line);
      Object.assign(testCase, parsed);
      return;
    } catch (e) {
      // Not JSON, continue
    }

    // Try Key: Value format
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      const normalizedKey = key.trim().toLowerCase();

      switch (normalizedKey) {
        case 'title':
        case 'name':
          testCase.title = value;
          break;
        case 'description':
          testCase.description = value;
          break;
        case 'tags':
        case 'tag':
          testCase.tags = value.split(',').map((t) => t.trim());
          break;
        case 'priority':
          testCase.priority = parseInt(value, 10);
          break;
        case 'automation':
        case 'automationstatus':
          testCase.automation = value as any;
          break;
        case 'assignedto':
        case 'owner':
          testCase.owner = value;
          break;
        case 'areapath':
        case 'area':
          testCase.areaPath = value;
          break;
        case 'iterationpath':
        case 'iteration':
          testCase.iterationPath = value;
          break;
        default:
          testCase.customFields![normalizedKey] = value;
      }
    }
  }

  private static parseStepLine(
    line: string,
    testCase: TestCase,
    isDisabled: boolean
  ): void {
    // Detect step markers
    const stepMarkers = [
      /^step\s*\d+:/i,
      /^action:/i,
      /^given:/i,
      /^when:/i,
      /^then:/i,
    ];

    const isStepStart = stepMarkers.some((regex) => regex.test(line));

    if (isStepStart || line.match(/^[\d]+\s*\./)) {
      // Extract action
      const action = line.replace(/^(step\s*\d+:|action:|given:|when:|then:)/i, '').trim();

      if (action) {
        testCase.testSteps.push({
          order: testCase.testSteps.length + 1,
          action,
          expectedResult: '',
        });
      }
    } else if (line.match(/^expected|^then|^assert|^verify/i)) {
      // Add to expected result of last step
      if (testCase.testSteps.length > 0) {
        const lastStep = testCase.testSteps[testCase.testSteps.length - 1];
        const expected = line
          .replace(/^(expected|then|assert|verify):\s*/i, '')
          .trim();
        lastStep.expectedResult = (lastStep.expectedResult ? lastStep.expectedResult + ' ' : '') + expected;
      }
    } else if (line.match(/^data|^testdata/i)) {
      // Add test data to last step
      if (testCase.testSteps.length > 0) {
        const lastStep = testCase.testSteps[testCase.testSteps.length - 1];
        const data = line.replace(/^(data|testdata):\s*/i, '').trim();
        lastStep.testData = data;
      }
    } else if (line.length > 0) {
      // Generic step content
      if (testCase.testSteps.length > 0) {
        const lastStep = testCase.testSteps[testCase.testSteps.length - 1];
        // Determine if this is action or expected
        if (!lastStep.expectedResult && lastStep.action) {
          lastStep.expectedResult = line;
        }
      }
    }
  }

  /**
   * Convert TestCase to formatted raw text (x-www-form-urlencoded style)
   * Format:
   * key: value
   * // disabled key: value
   * 
   * Empty line separates steps
   */
  static formatRawText(testCase: TestCase, disabledSteps: boolean[] = []): string {
    let raw = '';

    // Metadata section
    if (testCase.title) raw += `title: ${testCase.title}\n`;
    if (testCase.description) raw += `description: ${testCase.description}\n`;
    if (testCase.owner) raw += `assignedto: ${testCase.owner}\n`;
    if (testCase.priority) raw += `priority: ${testCase.priority}\n`;
    if (testCase.automation) raw += `automation: ${testCase.automation}\n`;
    if (testCase.tags && testCase.tags.length > 0) {
      raw += `tags: ${testCase.tags.join(', ')}\n`;
    }
    if (testCase.precondition) raw += `precondition: ${testCase.precondition}\n`;

    raw += '\n';

    // Steps section - x-www-form-urlencoded style
    if (testCase.testSteps.length > 0) {
      testCase.testSteps.forEach((step, index) => {
        const isDisabled = disabledSteps[index] === true;
        const prefix = isDisabled ? '// ' : '';

        raw += `${prefix}action: ${step.action}\n`;
        if (step.expectedResult) {
          raw += `${prefix}expected: ${step.expectedResult}\n`;
        }
        if (step.testData) {
          raw += `${prefix}data: ${step.testData}\n`;
        }
        raw += '\n'; // Empty line separates steps
      });
    }

    if (testCase.postCondition) {
      raw += `postcondition: ${testCase.postCondition}\n`;
    }

    return raw;
  }

  /**
   * Validate raw text for syntax errors
   */
  static validateRawText(rawText: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const testCase = this.parseRawText(rawText);

      if (!testCase.title || testCase.title.trim() === '') {
        errors.push('Title is required');
      }

      if (testCase.testSteps.length === 0) {
        errors.push('At least one step is required');
      }

      testCase.testSteps.forEach((step, index) => {
        if (!step.action || step.action.trim() === '') {
          errors.push(`Step ${index + 1}: Action is required`);
        }
      });

      if (testCase.priority && (testCase.priority < 0 || testCase.priority > 4)) {
        errors.push('Priority must be between 0 and 4');
      }
    } catch (error) {
      errors.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get syntax highlighting suggestions
   */
  static getSyntaxHighlighting(rawText: string): {
    line: number;
    type: 'keyword' | 'section' | 'disabled' | 'error';
    message?: string;
  }[] {
    const highlights: {
      line: number;
      type: 'keyword' | 'section' | 'disabled' | 'error';
      message?: string;
    }[] = [];
    const lines = rawText.split('\n');

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('//')) {
        highlights.push({ line: index + 1, type: 'disabled' });
      } else if (/^(Steps|Precondition|Postcondition|Custom Fields):/i.test(trimmed)) {
        highlights.push({ line: index + 1, type: 'section' });
      } else if (
        /^(Title|Description|AssignedTo|Priority|Automation|Tags|Step|Action|Expected|Data):/i.test(
          trimmed
        )
      ) {
        highlights.push({ line: index + 1, type: 'keyword' });
      }
    });

    return highlights;
  }
}
