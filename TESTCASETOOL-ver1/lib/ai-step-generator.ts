/**
 * AI Step Generator
 * Auto-generates test steps from descriptions using pattern matching and NLP-like heuristics
 */

import { TestStep } from '@/types';

export interface GeneratedStep {
  order: number;
  action: string;
  expectedResult: string;
  confidence: number; // 0-100
}

export interface StepGenerationContext {
  description: string;
  stepCount?: number;
  language?: 'en' | 'es' | 'fr' | 'de';
  testType?: 'functional' | 'ui' | 'api' | 'integration';
  framework?: string;
}

export class AiStepGenerator {
  private actionPatterns = [
    { pattern: /click|press|tap/i, action: 'Click', placeholder: '[element]' },
    { pattern: /fill|enter|type|input/i, action: 'Fill', placeholder: '[field]' },
    { pattern: /select|choose|pick/i, action: 'Select', placeholder: '[option]' },
    { pattern: /verify|check|assert|expect/i, action: 'Verify', placeholder: '[element/text]' },
    { pattern: /navigate|go to|open|visit/i, action: 'Navigate', placeholder: '[URL/page]' },
    { pattern: /wait|pause|sleep/i, action: 'Wait', placeholder: '[duration]' },
    { pattern: /scroll|swipe/i, action: 'Scroll', placeholder: '[direction]' },
    { pattern: /hover|mouse|move/i, action: 'Hover', placeholder: '[element]' },
    { pattern: /upload|attach|select file/i, action: 'Upload', placeholder: '[file]' },
    { pattern: /logout|sign out/i, action: 'Logout', placeholder: '' },
  ];

  private resultPatterns = [
    { pattern: /redirect|navigate|go to/i, result: 'should navigate to' },
    { pattern: /success|successful|confirm/i, result: 'should display a success message' },
    { pattern: /error|fail|fail/i, result: 'should display an error message' },
    { pattern: /save|save/i, result: 'should save successfully' },
    { pattern: /appear|show|display/i, result: 'should be displayed' },
    { pattern: /disappear|hide|remove/i, result: 'should be hidden or removed' },
  ];

  /**
   * Generate steps from test case description
   */
  generateStepsFromDescription(context: StepGenerationContext): GeneratedStep[] {
    const steps: GeneratedStep[] = [];

    // Split description into sentences
    const sentences = this.splitSentences(context.description);

    sentences.forEach((sentence, index) => {
      const action = this.extractAction(sentence);
      const expectedResult = this.extractExpectedResult(sentence);

      if (action || expectedResult) {
        steps.push({
          order: index + 1,
          action: action || sentence.substring(0, 100),
          expectedResult:
            expectedResult || 'Perform action successfully',
          confidence: this.calculateConfidence(sentence),
        });
      }
    });

    // Ensure at least one step
    if (steps.length === 0) {
      steps.push({
        order: 1,
        action: context.description,
        expectedResult: 'Action completes successfully',
        confidence: 30,
      });
    }

    return steps;
  }

  /**
   * Generate steps from behavior-driven description (Given-When-Then)
   */
  generateFromBdd(description: string): GeneratedStep[] {
    const steps: GeneratedStep[] = [];

    // Extract Given clause
    const givenMatch = description.match(/Given\s+(.+?)(?:When|$)/i);
    if (givenMatch) {
      steps.push({
        order: 1,
        action: `Setup: ${givenMatch[1].trim()}`,
        expectedResult: 'Setup completed',
        confidence: 85,
      });
    }

    // Extract When clause
    const whenMatch = description.match(/When\s+(.+?)(?:Then|$)/i);
    if (whenMatch) {
      const action = this.extractAction(whenMatch[1]);
      steps.push({
        order: steps.length + 1,
        action: action || whenMatch[1].trim(),
        expectedResult: 'Action executed',
        confidence: 80,
      });
    }

    // Extract Then clause
    const thenMatch = description.match(/Then\s+(.+?)$/i);
    if (thenMatch) {
      steps.push({
        order: steps.length + 1,
        action: 'Verify',
        expectedResult: thenMatch[1].trim(),
        confidence: 85,
      });
    }

    return steps.length > 0
      ? steps
      : this.generateStepsFromDescription({ description });
  }

  /**
   * Refine generated steps (improve clarity and structure)
   */
  refineSteps(steps: GeneratedStep[]): GeneratedStep[] {
    return steps.map((step) => ({
      ...step,
      action: this.improveAction(step.action),
      expectedResult: this.improveExpectedResult(step.expectedResult),
      confidence: Math.min(step.confidence + 10, 100),
    }));
  }

  /**
   * Convert generated steps to TestStep format
   */
  convertToTestSteps(generatedSteps: GeneratedStep[]): TestStep[] {
    return generatedSteps.map((gs) => ({
      order: gs.order,
      action: gs.action,
      expectedResult: gs.expectedResult,
    }));
  }

  /**
   * Generate step suggestions for common scenarios
   */
  generateFromScenario(scenario: string): GeneratedStep[] {
    const scenarios: Record<string, GeneratedStep[]> = {
      'user-login': [
        { order: 1, action: 'Navigate to login page', expectedResult: 'Login page displays', confidence: 95 },
        { order: 2, action: 'Enter username in email field', expectedResult: 'Email is entered', confidence: 95 },
        { order: 3, action: 'Enter password in password field', expectedResult: 'Password field is filled', confidence: 95 },
        { order: 4, action: 'Click Login button', expectedResult: 'User is logged in and redirected to dashboard', confidence: 95 },
      ],
      'form-submission': [
        { order: 1, action: 'Fill all required form fields', expectedResult: 'Fields are populated', confidence: 90 },
        { order: 2, action: 'Click Submit button', expectedResult: 'Form is submitted', confidence: 90 },
        { order: 3, action: 'Verify success message', expectedResult: 'Success message is displayed', confidence: 90 },
      ],
      'search-functionality': [
        { order: 1, action: 'Enter search term in search box', expectedResult: 'Search term is entered', confidence: 90 },
        { order: 2, action: 'Click Search or press Enter', expectedResult: 'Search results are displayed', confidence: 90 },
        { order: 3, action: 'Verify results contain search term', expectedResult: 'All results are relevant', confidence: 85 },
      ],
      'delete-confirmation': [
        { order: 1, action: 'Click Delete button', expectedResult: 'Confirmation dialog appears', confidence: 95 },
        { order: 2, action: 'Click Confirm in dialog', expectedResult: 'Item is deleted', confidence: 95 },
        { order: 3, action: 'Verify item is removed from list', expectedResult: 'Item no longer appears', confidence: 95 },
      ],
      'api-get': [
        { order: 1, action: 'Send GET request to endpoint', expectedResult: 'Request is sent', confidence: 95 },
        { order: 2, action: 'Verify HTTP status is 200', expectedResult: 'Response status is successful', confidence: 95 },
        { order: 3, action: 'Verify response data structure', expectedResult: 'Response contains expected fields', confidence: 90 },
      ],
    };

    const normalized = scenario.toLowerCase().replace(/\s+/g, '-');
    return scenarios[normalized] || [];
  }

  /**
   * Smart step suggestion based on step history
   */
  suggestNextStep(previousStep: TestStep, context?: string): string[] {
    const suggestions: string[] = [];

    if (previousStep.action.match(/navigate|go to|open/i)) {
      suggestions.push('Wait for page to load');
      suggestions.push('Verify page title or heading');
    }

    if (previousStep.action.match(/fill|enter|type/i)) {
      suggestions.push('Click submit or continue button');
      suggestions.push('Verify data is entered correctly');
    }

    if (previousStep.action.match(/click|submit/i)) {
      suggestions.push('Verify page has loaded');
      suggestions.push('Check for success or error message');
    }

    if (previousStep.action.match(/verify|check|assert/i)) {
      suggestions.push('Logout or reset');
      suggestions.push('Repeat test with different data');
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Detect test type from description
   */
  detectTestType(description: string): StepGenerationContext['testType'] {
    const lower = description.toLowerCase();

    if (
      lower.includes('click') ||
      lower.includes('button') ||
      lower.includes('ui') ||
      lower.includes('display')
    ) {
      return 'ui';
    }

    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('request')) {
      return 'api';
    }

    if (lower.includes('database') || lower.includes('service')) {
      return 'integration';
    }

    return 'functional';
  }

  /**
   * Private: Split text into sentences
   */
  private splitSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
  }

  /**
   * Private: Extract action from sentence
   */
  private extractAction(sentence: string): string {
    for (const pattern of this.actionPatterns) {
      if (pattern.pattern.test(sentence)) {
        // Remove the action word and clean up
        const cleaned = sentence.replace(pattern.pattern, '').trim();
        return `${pattern.action} ${cleaned || pattern.placeholder}`;
      }
    }

    return '';
  }

  /**
   * Private: Extract expected result
   */
  private extractExpectedResult(sentence: string): string {
    for (const pattern of this.resultPatterns) {
      if (pattern.pattern.test(sentence)) {
        return pattern.result;
      }
    }

    return '';
  }

  /**
   * Private: Calculate confidence score
   */
  private calculateConfidence(sentence: string): number {
    let confidence = 50;

    // Increase confidence if sentence has structure
    if (sentence.match(/then|verify|expect|should/i)) confidence += 20;
    if (sentence.match(/click|fill|enter|select/i)) confidence += 15;
    if (sentence.match(/and|then/i)) confidence += 10;

    // Decrease confidence for very long or ambiguous sentences
    if (sentence.length > 200) confidence -= 10;
    if (sentence.match(/maybe|perhaps|might|could/i)) confidence -= 20;

    return Math.max(30, Math.min(100, confidence));
  }

  /**
   * Private: Improve action clarity
   */
  private improveAction(action: string): string {
    // Capitalize first letter
    action = action.charAt(0).toUpperCase() + action.slice(1);

    // Remove redundant words
    action = action
      .replace(/user\s+/i, '')
      .replace(/the\s+/i, '')
      .replace(/\s+please/i, '');

    return action;
  }

  /**
   * Private: Improve expected result clarity
   */
  private improveExpectedResult(result: string): string {
    if (!result.endsWith('.')) {
      result += '.';
    }

    return result.charAt(0).toUpperCase() + result.slice(1);
  }
}
