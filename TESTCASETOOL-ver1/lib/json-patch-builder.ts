/**
 * JSON Patch builder for Azure DevOps API
 * Ensures all operations match the required format for:
 * POST /_apis/wit/workitems/$Test Case?api-version=7.1-preview.3
 *
 * Reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create
 */

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

export class JsonPatchBuilder {
  private operations: JsonPatchOperation[] = [];

  /**
   * Add operation with validation
   */
  addField(path: string, value: any): this {
    if (!value && value !== 0 && value !== false) {
      console.warn(`[JsonPatchBuilder] Skipping empty value for path: ${path}`);
      return this;
    }

    this.operations.push({
      op: 'add',
      path: `/fields${path.startsWith('/') ? path : '/' + path}`,
      value,
    });
    return this;
  }

  /**
   * Replace operation for updates
   */
  replaceField(path: string, value: any): this {
    if (!value && value !== 0 && value !== false) {
      console.warn(`[JsonPatchBuilder] Skipping empty value for path: ${path}`);
      return this;
    }

    this.operations.push({
      op: 'replace',
      path: `/fields${path.startsWith('/') ? path : '/' + path}`,
      value,
    });
    return this;
  }

  /**
   * Add System.Title (required)
   */
  setTitle(title: string): this {
    if (!title || title.trim().length === 0) {
      throw new Error('Title is required and cannot be empty');
    }
    return this.addField('System.Title', title.trim());
  }

  /**
   * Add System.Description
   */
  setDescription(description: string): this {
    if (description && description.trim().length > 0) {
      return this.addField('System.Description', description.trim());
    }
    return this;
  }

  /**
   * Add test steps as XML format (REQUIRED for proper rendering)
   * @param stepsXml - Must be valid XML in Microsoft format: <steps id="0" last="N"><step id="1" type="ActionStep"><action>...</action><expected>...</expected></step></steps>
   * or <Steps><Step id="1" type="ActionStep"><Action>...</Action><ExpectedResult>...</ExpectedResult></Step></Steps>
   */
  setSteps(stepsXml: string): this {
    if (!stepsXml || stepsXml.trim().length === 0) {
      console.warn('[JsonPatchBuilder] Empty steps XML provided');
      return this;
    }

    // Validate XML format (accept both <steps> and <Steps>)
    const hasSteps = stepsXml.includes('<steps') && stepsXml.includes('</steps>');
    const hasSteps2 = stepsXml.includes('<Steps>') && stepsXml.includes('</Steps>');
    
    if (!hasSteps && !hasSteps2) {
      throw new Error(
        'Steps must be in Microsoft XML format: <steps id="0" last="N"><step id="1" type="ActionStep"><action>...</action><expected>...</expected></step></steps>'
      );
    }

    return this.addField('Microsoft.VSTS.TCM.Steps', stepsXml);
  }

  /**
   * Add Priority (1-4, default 2)
   */
  setPriority(priority: number): this {
    if (priority < 1 || priority > 4) {
      throw new Error('Priority must be between 1 and 4');
    }
    return this.addField('Microsoft.VSTS.Common.Priority', priority);
  }

  /**
   * Add tags (semicolon-separated)
   */
  setTags(tags: string[]): this {
    if (tags && tags.length > 0) {
      const tagString = tags
        .filter((t) => t && t.trim().length > 0)
        .map((t) => t.trim())
        .join(';');

      if (tagString.length > 0) {
        return this.addField('System.Tags', tagString);
      }
    }
    return this;
  }

  /**
   * Add automation status
   */
  setAutomationStatus(
    status: 'Not Automated' | 'Planned' | 'In Progress' | 'Automated'
  ): this {
    return this.addField('Microsoft.VSTS.TCM.AutomationStatus', status);
  }

  /**
   * Add Area Path
   */
  setAreaPath(areaPath: string): this {
    if (areaPath && areaPath.trim().length > 0) {
      return this.addField('System.AreaPath', areaPath.trim());
    }
    return this;
  }

  /**
   * Add Iteration Path
   */
  setIterationPath(iterationPath: string): this {
    if (iterationPath && iterationPath.trim().length > 0) {
      return this.addField('System.IterationPath', iterationPath.trim());
    }
    return this;
  }

  /**
   * Add custom field
   */
  addCustomField(fieldName: string, value: any): this {
    if (!fieldName.startsWith('Custom.')) {
      console.warn(
        `[JsonPatchBuilder] Custom field should start with "Custom.": ${fieldName}`
      );
    }
    return this.addField(fieldName, value);
  }

  /**
   * Get all operations built so far
   */
  build(): JsonPatchOperation[] {
    if (this.operations.length === 0) {
      throw new Error('No operations added to patch');
    }
    return [...this.operations];
  }

  /**
   * Get operations as JSON string
   */
  buildJson(): string {
    return JSON.stringify(this.build(), null, 2);
  }

  /**
   * Validate the patch before sending
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.operations.length === 0) {
      errors.push('No operations defined');
      return { valid: false, errors };
    }

    // Check for required fields
    const hasTitle = this.operations.some(
      (op) => op.path === '/fields/System.Title'
    );
    if (!hasTitle) {
      errors.push('Title (System.Title) is required');
    }

    // Validate operation structure
    for (const op of this.operations) {
      if (!op.op || !['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(op.op)) {
        errors.push(`Invalid operation: ${op.op}`);
      }

      if (!op.path || !op.path.startsWith('/fields/')) {
        errors.push(`Invalid path: ${op.path}`);
      }

      if ((op.op === 'add' || op.op === 'replace') && op.value === undefined) {
        errors.push(`Missing value for ${op.op} operation on ${op.path}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Clear all operations
   */
  reset(): this {
    this.operations = [];
    return this;
  }
}

/**
 * Helper function to convert TestCase to JSON Patch operations
 */
export function createTestCasePatch(testCase: {
  title: string;
  description?: string;
  steps?: string; // XML format
  priority?: number;
  tags?: string[];
  automationStatus?: string;
  areaPath?: string;
  iterationPath?: string;
  customFields?: Record<string, any>;
}): JsonPatchOperation[] {
  const builder = new JsonPatchBuilder();

  builder.setTitle(testCase.title);

  if (testCase.description) {
    builder.setDescription(testCase.description);
  }

  if (testCase.steps) {
    builder.setSteps(testCase.steps);
  }

  if (testCase.priority) {
    builder.setPriority(testCase.priority);
  }

  if (testCase.tags) {
    builder.setTags(testCase.tags);
  }

  if (testCase.automationStatus) {
    builder.setAutomationStatus(
      testCase.automationStatus as
        | 'Not Automated'
        | 'Planned'
        | 'In Progress'
        | 'Automated'
    );
  }

  if (testCase.areaPath) {
    builder.setAreaPath(testCase.areaPath);
  }

  if (testCase.iterationPath) {
    builder.setIterationPath(testCase.iterationPath);
  }

  if (testCase.customFields) {
    for (const [key, value] of Object.entries(testCase.customFields)) {
      builder.addCustomField(key, value);
    }
  }

  return builder.build();
}
