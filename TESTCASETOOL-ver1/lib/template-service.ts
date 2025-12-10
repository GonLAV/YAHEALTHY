import { TestCase, TemplateLibrary } from '@/types';

export const DEFAULT_TEMPLATES: TemplateLibrary[] = [
  {
    id: 'api-test-template',
    name: 'API Test Case',
    description: 'Standard template for API testing',
    category: 'API',
    template: {
      title: 'API Endpoint Test',
      description: 'Test API endpoint functionality',
      testSteps: [
        {
          action: 'Prepare test data',
          expectedResult: 'Test data ready',
          order: 1,
        },
        {
          action: 'Send API request',
          expectedResult: 'Response received',
          order: 2,
        },
        {
          action: 'Validate response status',
          expectedResult: 'Status is 200',
          order: 3,
        },
        {
          action: 'Verify response body',
          expectedResult: 'Body matches expected structure',
          order: 4,
        },
      ],
      priority: 1,
      automation: 'Automated',
      tags: ['api', 'smoke'],
    },
    createdBy: 'System',
    createdDate: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'ui-test-template',
    name: 'UI/Functional Test Case',
    description: 'Standard template for UI testing',
    category: 'UI',
    template: {
      title: 'UI Feature Test',
      description: 'Test user interface feature',
      testSteps: [
        {
          action: 'Navigate to page',
          expectedResult: 'Page loads successfully',
          order: 1,
        },
        {
          action: 'Verify element visibility',
          expectedResult: 'Element is visible',
          order: 2,
        },
        {
          action: 'Perform user action',
          expectedResult: 'Expected result occurs',
          order: 3,
        },
        {
          action: 'Verify page state',
          expectedResult: 'Page state matches expectation',
          order: 4,
        },
      ],
      priority: 2,
      automation: 'Planned',
      tags: ['ui', 'functional'],
    },
    createdBy: 'System',
    createdDate: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'login-test-template',
    name: 'Login Test Case',
    description: 'Template for login/authentication testing',
    category: 'Authentication',
    template: {
      title: 'User Login Test',
      description: 'Verify user authentication flow',
      precondition: 'User account exists with known credentials',
      testSteps: [
        {
          action: 'Navigate to login page',
          expectedResult: 'Login form is displayed',
          order: 1,
        },
        {
          action: 'Enter valid username',
          expectedResult: 'Username is entered in the field',
          order: 2,
        },
        {
          action: 'Enter valid password',
          expectedResult: 'Password is masked',
          order: 3,
        },
        {
          action: 'Click login button',
          expectedResult: 'Authentication is processed',
          order: 4,
        },
        {
          action: 'Verify redirect to dashboard',
          expectedResult: 'Dashboard page loads',
          order: 5,
        },
      ],
      priority: 0,
      automation: 'Automated',
      tags: ['authentication', 'smoke', 'critical'],
      postCondition: 'User is logged in and dashboard is accessible',
    },
    createdBy: 'System',
    createdDate: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'form-test-template',
    name: 'Form Submission Test',
    description: 'Template for form validation and submission',
    category: 'Forms',
    template: {
      title: 'Form Submission Test',
      description: 'Verify form validation and submission',
      testSteps: [
        {
          action: 'Fill in required fields with valid data',
          expectedResult: 'Fields accept input',
          order: 1,
        },
        {
          action: 'Leave a required field empty',
          expectedResult: 'Validation error is shown',
          order: 2,
        },
        {
          action: 'Fill in all required fields',
          expectedResult: 'All fields contain valid data',
          order: 3,
        },
        {
          action: 'Click submit button',
          expectedResult: 'Form is submitted successfully',
          order: 4,
        },
        {
          action: 'Verify success message',
          expectedResult: 'Success confirmation is displayed',
          order: 5,
        },
      ],
      priority: 1,
      automation: 'Planned',
      tags: ['form', 'validation'],
    },
    createdBy: 'System',
    createdDate: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'smoke-test-template',
    name: 'Smoke Test Case',
    description: 'Quick smoke test template',
    category: 'Smoke',
    template: {
      title: 'Smoke Test',
      description: 'Quick sanity check of core functionality',
      testSteps: [
        {
          action: 'Launch application',
          expectedResult: 'Application starts without errors',
          order: 1,
        },
        {
          action: 'Navigate to main page',
          expectedResult: 'Main page loads',
          order: 2,
        },
        {
          action: 'Verify critical elements',
          expectedResult: 'All critical elements are present',
          order: 3,
        },
      ],
      priority: 0,
      automation: 'Automated',
      tags: ['smoke'],
    },
    createdBy: 'System',
    createdDate: new Date().toISOString(),
    usageCount: 0,
  },
];

export class TemplateService {
  private static templates: TemplateLibrary[] = [...DEFAULT_TEMPLATES];

  /**
   * Get all templates
   */
  static getTemplates(): TemplateLibrary[] {
    return [...this.templates];
  }

  /**
   * Get templates by category
   */
  static getByCategory(category: string): TemplateLibrary[] {
    return this.templates.filter((t) => t.category === category);
  }

  /**
   * Get template by ID
   */
  static getTemplate(id: string): TemplateLibrary | undefined {
    return this.templates.find((t) => t.id === id);
  }

  /**
   * Create test case from template
   */
  static createTestCaseFromTemplate(
    templateId: string,
    overrides: Partial<TestCase> = {}
  ): TestCase | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    const mergedTestSteps = [
      ...(template.template.testSteps || []),
      ...(overrides.testSteps || []),
    ];

    const testCase: TestCase = {
      title: template.template.title || '',
      testSteps: mergedTestSteps,
      ...template.template,
      ...overrides,
    };

    // Increment usage count
    const idx = this.templates.findIndex((t) => t.id === templateId);
    if (idx >= 0) {
      this.templates[idx].usageCount++;
    }

    return testCase;
  }

  /**
   * Add custom template
   */
  static addTemplate(template: TemplateLibrary): void {
    // Ensure unique ID
    template.id = template.id || `custom-${Date.now()}`;
    this.templates.push(template);
  }

  /**
   * Remove template
   */
  static removeTemplate(id: string): boolean {
    const idx = this.templates.findIndex((t) => t.id === id);
    if (idx >= 0) {
      this.templates.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get most used templates
   */
  static getMostUsed(limit: number = 5): TemplateLibrary[] {
    return [...this.templates]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * Search templates
   */
  static search(query: string): TemplateLibrary[] {
    const q = query.toLowerCase();
    return this.templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }

  /**
   * Get categories
   */
  static getCategories(): string[] {
    return Array.from(new Set(this.templates.map((t) => t.category)));
  }
}
