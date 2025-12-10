import axios, { AxiosInstance } from 'axios';
import {
  AzureDevOpsConfig,
  TestPlan,
  TestSuite,
  TestCase,
  TestRun,
  TestResult,
  Attachment,
} from '@/types';
import { JsonPatchBuilder, JsonPatchOperation } from './json-patch-builder';
import { apiLogger, measureApiCall } from './api-logger';
import { stepsToXml } from './steps-utils';
import stepsAdapter from './steps-adapter';

export class AzureDevOpsClient {
  private client: AxiosInstance;
  private config: AzureDevOpsConfig;
  private baseUrl: string;
  private isTFS: boolean;
  private apiVersion: string;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;
    this.isTFS = config.organizationUrl.includes('/tfs') || !config.organizationUrl.includes('dev.azure.com');

    // Build base URL for API calls depending on Cloud vs TFS (on-prem)
    try {
      const inputUrl = config.organizationUrl.replace(/\/$/, '');
      const parsed = new URL(inputUrl);
      const origin = parsed.origin;
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      // Detect if the URL already contains '/tfs/{collection}'
      const tfsIndex = pathParts.indexOf('tfs');
      const collectionFromUrl = tfsIndex >= 0 && pathParts.length > tfsIndex + 1 ? pathParts[tfsIndex + 1] : undefined;

      const collection = config.collectionName || collectionFromUrl;

      if (this.isTFS) {
        if (collection) {
          // Construct: https://server/tfs/{collection}/{project}/_apis
          this.baseUrl = `${origin}/tfs/${collection}/${config.projectName}/_apis`;
        } else {
          // If no collection provided, assume the user included it in the org URL path
          // or use the provided orgUrl directly as base and append project
          const trimmed = inputUrl;
          this.baseUrl = `${trimmed}/${config.projectName}/_apis`;
        }
      } else {
        // Azure DevOps Cloud format: https://dev.azure.com/{org}/{project}/_apis
        this.baseUrl = `${inputUrl}/${config.projectName}/_apis`;
      }
    } catch (err) {
      // Fallback: naive concatenation
      const baseUrl = config.organizationUrl.replace(/\/$/, '');
      this.baseUrl = `${baseUrl}/${config.projectName}/_apis`;
    }

    // choose api version: prefer explicit config, otherwise TFS -> 5.0, cloud -> 7.0
    this.apiVersion = config.apiVersion || (this.isTFS ? '5.0' : '7.0');

    const encodedToken = Buffer.from(`:${config.patToken}`).toString('base64');

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
      },
      // Disable SSL verification for self-signed certificates on TFS
      httpAgent: this.isTFS ? { rejectUnauthorized: false } : undefined,
      httpsAgent: this.isTFS ? { rejectUnauthorized: false } : undefined,
    });
  }

  // Test Plan APIs
  async getTestPlans(): Promise<TestPlan[]> {
    try {
      const response = await this.client.get(`/test/plans?api-version=${this.apiVersion}`);
      return response.data.value || [];
    } catch (error) {
      console.error('Failed to fetch test plans:', error);
      throw error;
    }
  }

  async getTestPlan(testPlanId: number): Promise<TestPlan> {
    try {
      const response = await this.client.get(
        `/test/plans/${testPlanId}?api-version=${this.apiVersion}`
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch test plan ${testPlanId}:`, error);
      throw error;
    }
  }

  async createTestPlan(plan: Partial<TestPlan>): Promise<TestPlan> {
    try {
      const response = await this.client.post(`/test/plans?api-version=${this.apiVersion}`, {
        name: plan.name,
        description: plan.description || '',
        owner: plan.owner,
        iteration: plan.iteration,
        areaPath: plan.area,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to create test plan:', error);
      throw error;
    }
  }

  async updateTestPlan(
    testPlanId: number,
    plan: Partial<TestPlan>
  ): Promise<TestPlan> {
    try {
      const response = await this.client.patch(
        `/test/plans/${testPlanId}?api-version=${this.apiVersion}`,
        plan
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to update test plan ${testPlanId}:`, error);
      throw error;
    }
  }

  async deleteTestPlan(testPlanId: number): Promise<void> {
    try {
      await this.client.delete(`/test/plans/${testPlanId}?api-version=7.0`);
    } catch (error) {
      console.error(`Failed to delete test plan ${testPlanId}:`, error);
      throw error;
    }
  }

  // Test Suite APIs
  async getTestSuites(testPlanId: number): Promise<TestSuite[]> {
    try {
      const response = await this.client.get(
        `/test/plans/${testPlanId}/suites?api-version=${this.apiVersion}`
      );
      return response.data.value || [];
    } catch (error) {
      console.error(`Failed to fetch test suites for plan ${testPlanId}:`, error);
      throw error;
    }
  }

  async getTestSuite(testPlanId: number, testSuiteId: number): Promise<TestSuite> {
    try {
      const response = await this.client.get(
        `/test/plans/${testPlanId}/suites/${testSuiteId}?api-version=${this.apiVersion}`
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch test suite ${testSuiteId}:`, error);
      throw error;
    }
  }

  async createTestSuite(
    testPlanId: number,
    suite: Partial<TestSuite>
  ): Promise<TestSuite> {
    try {
      const response = await this.client.post(
        `/test/plans/${testPlanId}/suites?api-version=${this.apiVersion}`,
        {
          name: suite.name,
          suiteType: suite.suiteType || 'StaticTestSuite',
          parentSuiteId: suite.parentSuiteId,
        }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to create test suite:', error);
      throw error;
    }
  }

  // Test Case APIs
  async getTestCases(testPlanId: number, testSuiteId: number): Promise<TestCase[]> {
    try {
      const response = await this.client.get(
        `/test/plans/${testPlanId}/suites/${testSuiteId}/testcases?api-version=${this.apiVersion}`
      );
      return response.data.value || [];
    } catch (error) {
      console.error(
        `Failed to fetch test cases for suite ${testSuiteId}:`,
        error
      );
      throw error;
    }
  }

  async getTestCase(workItemId: number): Promise<TestCase> {
    try {
      const response = await this.client.get(
        `/wit/workitems/${workItemId}?api-version=${this.apiVersion}&$expand=all`
      );
      return this.parseWorkItemToTestCase(response.data);
    } catch (error) {
      console.error(`Failed to fetch test case ${workItemId}:`, error);
      throw error;
    }
  }

  async createTestCase(testCase: TestCase): Promise<TestCase> {
    try {
      // Build JSON Patch operations using the builder
      const builder = new JsonPatchBuilder();

      // Required field
      builder.setTitle(testCase.title);

      // Optional fields
      if (testCase.description) {
        builder.setDescription(testCase.description);
        // Also sync to Summary field (Microsoft.VSTS.Common.Summary) for test case summary display
        builder.addPatchOperation('add', '/fields/Microsoft.VSTS.Common.Summary', testCase.description);
      }

      // Format steps as XML (CRITICAL: must be XML, not JSON)
      if (testCase.testSteps && testCase.testSteps.length > 0) {
        // Convert TestStep[] to Step[] and then to XML using the standard utils
        const steps = stepsAdapter.fromTestSteps(testCase.testSteps);
        const stepsXml = this.formatStepsAsXml(steps);
        
        // DEBUG: Log the XML being sent
        console.log('[Azure DevOps] Creating test case with steps:');
        console.log('[Azure DevOps] Title:', testCase.title);
        console.log('[Azure DevOps] Step count:', steps.length);
        console.log('[Azure DevOps] Steps XML:', stepsXml);
        
        builder.setSteps(stepsXml);
      }

      if (testCase.priority) {
        builder.setPriority(testCase.priority);
      }

      if (testCase.tags && testCase.tags.length > 0) {
        builder.setTags(testCase.tags);
      }

      if (testCase.automation) {
        builder.setAutomationStatus(
          testCase.automation as
            | 'Not Automated'
            | 'Planned'
            | 'In Progress'
            | 'Automated'
        );
      }

      // Build the patch operations
      const operations = builder.build();

      // Validate before sending
      const validation = builder.validate();
      if (!validation.valid) {
        console.error('[Azure DevOps] Patch validation failed:', validation.errors);
        apiLogger.logPatchValidation(
          `/wit/workitems/$Test%20Case`,
          operations,
          validation
        );
        throw new Error(`Invalid patch: ${validation.errors.join(', ')}`);
      }

      // Log the patch for debugging
      console.log('[Azure DevOps] Patch operations to send:');
      operations.forEach((op, i) => {
        console.log(`  [${i}] op=${op.op}, path=${op.path}`);
        if (op.value && typeof op.value === 'string' && op.value.length > 100) {
          console.log(`       value=${op.value.substring(0, 100)}...`);
        } else {
          console.log(`       value=${JSON.stringify(op.value)}`);
        }
      });
      
      apiLogger.logPatchValidation(
        `/wit/workitems/$Test%20Case`,
        operations,
        validation
      );

      // Send API request with proper headers
      const endpoint = `/wit/workitems/$Test%20Case?api-version=${this.apiVersion}`;
      
      const response = await this.client.post(endpoint, operations, {
        headers: {
          'Content-Type': 'application/json-patch+json',
        },
      });

      // Log success
      apiLogger.logResponse(endpoint, response.status, response.data);

      return this.parseWorkItemToTestCase(response.data);
    } catch (error) {
      console.error('[Azure DevOps] Failed to create test case:', error);
      apiLogger.logError('/wit/workitems/$Test%20Case', error);
      throw error;
    }
  }

  async updateTestCase(testCaseId: number, testCase: Partial<TestCase>): Promise<TestCase> {
    try {
      const operations: any[] = [];

      if (testCase.title) {
        operations.push({
          op: 'add',
          path: '/fields/System.Title',
          value: testCase.title,
        });
      }

      if (testCase.description) {
        operations.push({
          op: 'add',
          path: '/fields/System.Description',
          value: testCase.description,
        });
        // Also sync to Summary field
        operations.push({
          op: 'add',
          path: '/fields/Microsoft.VSTS.Common.Summary',
          value: testCase.description,
        });
      }

      if (testCase.testSteps) {
        // Convert TestStep[] to Step[] and then to XML using the standard utils
        const steps = stepsAdapter.fromTestSteps(testCase.testSteps);
        const stepsXml = this.formatStepsAsXml(steps);
        operations.push({
          op: 'add',
          path: '/fields/Microsoft.VSTS.TCM.Steps',
          value: stepsXml,
        });
      }

      if (testCase.priority !== undefined) {
        operations.push({
          op: 'add',
          path: '/fields/Microsoft.VSTS.Common.Priority',
          value: testCase.priority,
        });
      }

      if (testCase.tags) {
        operations.push({
          op: 'add',
          path: '/fields/System.Tags',
          value: testCase.tags.join(';'),
        });
      }

      const response = await this.client.patch(
        `/wit/workitems/${testCaseId}?api-version=${this.apiVersion}`,
        operations,
        {
          headers: {
            'Content-Type': 'application/json-patch+json',
          },
        }
      );

      return this.parseWorkItemToTestCase(response.data);
    } catch (error) {
      console.error(`Failed to update test case ${testCaseId}:`, error);
      throw error;
    }
  }

  async deleteTestCase(testCaseId: number): Promise<void> {
    try {
      await this.client.delete(`/wit/workitems/${testCaseId}?api-version=${this.apiVersion}`);
    } catch (error) {
      console.error(`Failed to delete test case ${testCaseId}:`, error);
      throw error;
    }
  }

  // Test Run APIs
  async getTestRuns(testPlanId: number): Promise<TestRun[]> {
    try {
      const response = await this.client.get(
        `/test/runs?planIds=${testPlanId}&api-version=${this.apiVersion}`
      );
      return response.data.value || [];
    } catch (error) {
      console.error(`Failed to fetch test runs for plan ${testPlanId}:`, error);
      throw error;
    }
  }

  async createTestRun(testRun: Partial<TestRun>): Promise<TestRun> {
    try {
      const response = await this.client.post(`/test/runs?api-version=${this.apiVersion}`, {
        name: testRun.name,
        testPlanId: testRun.testPlanId,
        testSuiteId: testRun.testSuiteId,
        owner: testRun.owner,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to create test run:', error);
      throw error;
    }
  }

  async getTestResults(testRunId: number): Promise<TestResult[]> {
    try {
      const response = await this.client.get(
        `/test/runs/${testRunId}/results?api-version=${this.apiVersion}`
      );
      return response.data.value || [];
    } catch (error) {
      console.error(`Failed to fetch test results for run ${testRunId}:`, error);
      throw error;
    }
  }

  async updateTestResult(
    testRunId: number,
    testResultId: number,
    result: Partial<TestResult>
  ): Promise<TestResult> {
    try {
      const response = await this.client.patch(
        `/test/runs/${testRunId}/results/${testResultId}?api-version=7.0`,
        result
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update test result ${testResultId}:`,
        error
      );
      throw error;
    }
  }

  // Helper methods
  /**
   * Format test steps as XML for Azure DevOps / TFS
   * CRITICAL: TFS expects lowercase <steps> and <step> tags with specific attributes
   * Format: <steps id="0" last="N"><step id="X" type="ActionStep|ValidateStep"><action>...</action><expected>...</expected></step></steps>
   */
  private formatStepsAsXml(steps: any[]): string {
    if (!steps || steps.length === 0) {
      return '<steps id="0" last="0"></steps>';
    }

    let xml = `<steps id="0" last="${steps.length}">`;
    steps.forEach((step, index) => {
      const stepId = index + 1;
      const action = this.escapeXml(step.action || '');
      const expected = this.escapeXml(step.expectedResult || step.expected || '');
      const type = (step.expectedResult && step.expectedResult.trim()) ? 'ValidateStep' : 'ActionStep';

      // TFS format: <step id="X" type="ActionStep|ValidateStep"><action>...</action><expected>...</expected></step>
      xml += `<step id="${stepId}" type="${type}"><action>${action}</action><expected>${expected}</expected></step>`;
    });
    xml += '</steps>';

    return xml;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    if (!text) return '';

    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };

    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private parseWorkItemToTestCase(workItem: any): TestCase {
    const fields = workItem.fields || {};
    return {
      id: workItem.id,
      title: fields['System.Title'] || '',
      description: fields['System.Description'] || '',
      state: fields['System.State'] || 'Design',
      priority: fields['Microsoft.VSTS.Common.Priority'] || 2,
      automation: fields['Microsoft.VSTS.TCM.AutomationStatus'] || 'Not Automated',
      tags: fields['System.Tags']
        ? fields['System.Tags'].split(';').map((t: string) => t.trim())
        : [],
      testSteps: this.parseStepsFromHtml(fields['Microsoft.VSTS.TCM.Steps']),
      createdDate: fields['System.CreatedDate'],
      modifiedDate: fields['System.ChangedDate'],
      createdBy: fields['System.CreatedBy']?.displayName,
      modifiedBy: fields['System.ChangedBy']?.displayName,
    };
  }

  private parseStepsFromHtml(stepsHtml: string | undefined): any[] {
    if (!stepsHtml) return [];

    const steps: any[] = [];
    const stepRegex = /<step[^>]*>.*?<\/step>/gs;
    const matches = stepsHtml.match(stepRegex) || [];

    matches.forEach((stepXml, index) => {
      const descMatch = stepXml.match(/<description>(.*?)<\/description>/s);
      const expectedMatch = stepXml.match(/<expectedResult>(.*?)<\/expectedResult>/s);

      steps.push({
        order: index + 1,
        action: descMatch
          ? this.unescapeHtml(descMatch[1])
          : '',
        expectedResult: expectedMatch
          ? this.unescapeHtml(expectedMatch[1])
          : '',
      });
    });

    return steps;
  }

  private unescapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
    };
    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, (m) => map[m]);
  }
}
