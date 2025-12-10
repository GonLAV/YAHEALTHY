/**
 * Automation Script Mapper
 * Links test steps to automation scripts, code, and CI/CD pipelines
 */

export interface AutomationScript {
  id: string;
  name: string;
  language: 'javascript' | 'python' | 'csharp' | 'java' | 'bash' | 'powershell';
  filePath: string;
  repository?: string;
  branch?: string;
  framework: 'selenium' | 'cypress' | 'playwright' | 'appium' | 'uft' | 'custom';
  testMethods?: string[];
  lastUpdated?: Date;
  maintainer?: string;
  tags?: string[];
}

export interface StepAutomationMapping {
  stepId: string;
  stepDescription: string;
  automationScript?: AutomationScript;
  automationMethod?: string;
  mappingType: 'manual' | 'auto-detected' | 'ai-suggested';
  confidence?: number; // 0-100 for AI suggestions
  mappingNotes?: string;
  createdAt?: Date;
  createdBy?: string;
}

export interface AutomationSuggestion {
  stepIndex: number;
  stepDescription: string;
  suggestedScripts: AutomationScript[];
  suggestedMethods: string[];
  confidence: number;
  reason: string;
}

export class AutomationScriptMapper {
  private scriptLibrary: Map<string, AutomationScript> = new Map();
  private mappings: Map<string, StepAutomationMapping> = new Map();

  /**
   * Register automation script
   */
  addScript(script: AutomationScript): void {
    this.scriptLibrary.set(script.id, script);
  }

  /**
   * Get script by ID
   */
  getScript(scriptId: string): AutomationScript | undefined {
    return this.scriptLibrary.get(scriptId);
  }

  /**
   * Search scripts by name/tags/language
   */
  searchScripts(query: {
    keyword?: string;
    language?: AutomationScript['language'];
    framework?: AutomationScript['framework'];
    tags?: string[];
  }): AutomationScript[] {
    return Array.from(this.scriptLibrary.values()).filter((script) => {
      if (query.keyword) {
        const matches = script.name.toLowerCase().includes(query.keyword.toLowerCase()) ||
          script.filePath.toLowerCase().includes(query.keyword.toLowerCase());
        if (!matches) return false;
      }

      if (query.language && script.language !== query.language) return false;
      if (query.framework && script.framework !== query.framework) return false;

      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some((tag) => script.tags?.includes(tag));
        if (!hasTag) return false;
      }

      return true;
    });
  }

  /**
   * Map test step to automation script
   */
  mapStepToScript(
    stepId: string,
    stepDescription: string,
    scriptId: string,
    methodName: string,
    notes?: string
  ): StepAutomationMapping {
    const script = this.scriptLibrary.get(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    const mapping: StepAutomationMapping = {
      stepId,
      stepDescription,
      automationScript: script,
      automationMethod: methodName,
      mappingType: 'manual',
      mappingNotes: notes,
      createdAt: new Date(),
    };

    this.mappings.set(stepId, mapping);
    return mapping;
  }

  /**
   * Auto-detect automation scripts based on step description
   */
  detectAutomationScripts(
    stepId: string,
    stepDescription: string
  ): AutomationSuggestion[] {
    const suggestions: AutomationSuggestion[] = [];

    // Extract action keywords
    const keywords = this.extractKeywords(stepDescription);

    // Search for matching scripts
    const matchingScripts = Array.from(this.scriptLibrary.values()).filter((script) => {
      const matches = keywords.some((keyword) =>
        script.name.toLowerCase().includes(keyword) ||
        script.filePath.toLowerCase().includes(keyword) ||
        script.tags?.some((tag) => tag.toLowerCase().includes(keyword))
      );

      return matches;
    });

    // Create suggestions with confidence scores
    matchingScripts.forEach((script) => {
      const confidence = this.calculateMatchConfidence(stepDescription, script);
      if (confidence > 30) {
        suggestions.push({
          stepIndex: parseInt(stepId.replace('step_', ''), 10),
          stepDescription,
          suggestedScripts: [script],
          suggestedMethods: script.testMethods || [],
          confidence,
          reason: `Matched keywords: ${keywords.join(', ')}`,
        });
      }
    });

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions;
  }

  /**
   * Get mapping for step
   */
  getMapping(stepId: string): StepAutomationMapping | undefined {
    return this.mappings.get(stepId);
  }

  /**
   * Remove mapping
   */
  removeMapping(stepId: string): boolean {
    return this.mappings.delete(stepId);
  }

  /**
   * Get all mappings for test case
   */
  getAllMappings(stepIds: string[]): StepAutomationMapping[] {
    return stepIds
      .map((id) => this.mappings.get(id))
      .filter((m) => m !== undefined) as StepAutomationMapping[];
  }

  /**
   * Export mappings as CI/CD compatible format
   */
  exportAsCI(
    mappings: StepAutomationMapping[],
    format: 'yaml' | 'json' | 'yaml-github-actions' | 'yaml-gitlab-ci'
  ): string {
    if (format === 'json') {
      return JSON.stringify(mappings, null, 2);
    }

    if (format === 'yaml') {
      return this.exportAsYaml(mappings);
    }

    if (format === 'yaml-github-actions') {
      return this.exportAsGithubActions(mappings);
    }

    if (format === 'yaml-gitlab-ci') {
      return this.exportAsGitlabCI(mappings);
    }

    return '';
  }

  /**
   * Export as YAML
   */
  private exportAsYaml(mappings: StepAutomationMapping[]): string {
    let yaml = 'automationMappings:\n';

    mappings.forEach((mapping, idx) => {
      yaml += `  - step: ${idx + 1}\n`;
      yaml += `    description: "${mapping.stepDescription}"\n`;
      if (mapping.automationScript) {
        yaml += `    script:\n`;
        yaml += `      id: ${mapping.automationScript.id}\n`;
        yaml += `      name: ${mapping.automationScript.name}\n`;
        yaml += `      language: ${mapping.automationScript.language}\n`;
        yaml += `      framework: ${mapping.automationScript.framework}\n`;
        yaml += `      filePath: ${mapping.automationScript.filePath}\n`;
      }
      if (mapping.automationMethod) {
        yaml += `    method: ${mapping.automationMethod}\n`;
      }
    });

    return yaml;
  }

  /**
   * Export as GitHub Actions workflow
   */
  private exportAsGithubActions(mappings: StepAutomationMapping[]): string {
    const jobs: Record<string, any> = {};

    mappings.forEach((mapping, idx) => {
      const jobName = `automation-step-${idx + 1}`;
      jobs[jobName] = {
        'runs-on': 'ubuntu-latest',
        steps: [
          {
            uses: 'actions/checkout@v3',
          },
        ],
      };

      if (mapping.automationScript) {
        const script = mapping.automationScript;

        if (script.language === 'javascript') {
          jobs[jobName].steps.push({
            name: `Run ${mapping.automationMethod || 'test'}`,
            run: `npm test -- --testNamePattern="${mapping.automationMethod}"`,
          });
        } else if (script.language === 'python') {
          jobs[jobName].steps.push({
            name: `Run ${mapping.automationMethod || 'test'}`,
            run: `python -m pytest ${script.filePath}::${mapping.automationMethod}`,
          });
        }
      }
    });

    const workflow = {
      name: 'Automated Test Execution',
      on: ['push', 'pull_request'],
      jobs,
    };

    return this.convertToYaml(workflow);
  }

  /**
   * Export as GitLab CI
   */
  private exportAsGitlabCI(mappings: StepAutomationMapping[]): string {
    let yaml = `stages:
  - test

`;

    mappings.forEach((mapping, idx) => {
      const jobName = `automation_step_${idx + 1}`;
      yaml += `${jobName}:\n`;
      yaml += `  stage: test\n`;
      yaml += `  script:\n`;

      if (mapping.automationScript) {
        const script = mapping.automationScript;

        if (script.language === 'javascript') {
          yaml += `    - npm install\n`;
          yaml += `    - npm test -- --testNamePattern="${mapping.automationMethod}"\n`;
        } else if (script.language === 'python') {
          yaml += `    - pip install -r requirements.txt\n`;
          yaml += `    - python -m pytest ${script.filePath}::${mapping.automationMethod}\n`;
        } else if (script.language === 'bash') {
          yaml += `    - bash ${script.filePath}\n`;
        }
      }

      yaml += `  artifacts:\n`;
      yaml += `    reports:\n`;
      yaml += `      junit: results/junit.xml\n`;
      yaml += `\n`;
    });

    return yaml;
  }

  /**
   * Generate documentation for automation mappings
   */
  generateAutomationDocs(
    mappings: StepAutomationMapping[]
  ): string {
    let docs = '# Automation Mappings\n\n';

    mappings.forEach((mapping, idx) => {
      docs += `## Step ${idx + 1}: ${mapping.stepDescription}\n\n`;

      if (mapping.automationScript) {
        const script = mapping.automationScript;
        docs += `**Script**: ${script.name}\n`;
        docs += `**Language**: ${script.language}\n`;
        docs += `**Framework**: ${script.framework}\n`;
        docs += `**Path**: \`${script.filePath}\`\n`;

        if (mapping.automationMethod) {
          docs += `**Method**: \`${mapping.automationMethod}()\`\n`;
        }

        if (script.repository) {
          docs += `**Repository**: ${script.repository}\n`;
        }

        if (script.maintainer) {
          docs += `**Maintainer**: ${script.maintainer}\n`;
        }
      } else {
        docs += '**Status**: Not yet automated\n';
      }

      if (mapping.mappingNotes) {
        docs += `**Notes**: ${mapping.mappingNotes}\n`;
      }

      docs += '\n';
    });

    return docs;
  }

  /**
   * Calculate match confidence
   */
  private calculateMatchConfidence(
    stepDescription: string,
    script: AutomationScript
  ): number {
    let confidence = 0;

    // Keyword matching
    const stepLower = stepDescription.toLowerCase();
    const nameLower = script.name.toLowerCase();

    const commonWords = ['click', 'fill', 'submit', 'check', 'verify', 'assert', 'wait', 'navigate'];
    const matchedWords = commonWords.filter(
      (word) => stepLower.includes(word) && nameLower.includes(word)
    );

    confidence += matchedWords.length * 15;

    // Tag matching
    const tags = script.tags || [];
    const hasRelevantTag = tags.some((tag) => stepLower.includes(tag.toLowerCase()));
    if (hasRelevantTag) confidence += 25;

    // Repository match
    if (script.repository && stepLower.includes('git')) confidence += 10;

    return Math.min(confidence, 100);
  }

  /**
   * Extract keywords from step description
   */
  private extractKeywords(description: string): string[] {
    const keywords: string[] = [];
    const stopWords = [
      'the',
      'a',
      'an',
      'and',
      'or',
      'is',
      'to',
      'in',
      'on',
      'at',
      'for',
      'of',
      'with',
    ];

    const words = description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

    words.forEach((word) => {
      if (!stopWords.includes(word) && !keywords.includes(word)) {
        keywords.push(word);
      }
    });

    return keywords.slice(0, 5); // Return top 5 keywords
  }

  /**
   * Helper to convert object to YAML
   */
  private convertToYaml(obj: any, indent: number = 0): string {
    let yaml = '';
    const spaces = ' '.repeat(indent);

    for (const key in obj) {
      const value = obj[key];

      if (value === null || value === undefined) continue;

      if (typeof value === 'string') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach((item) => {
          yaml += `${spaces}  - ${typeof item === 'object' ? '\n' + this.convertToYaml(item, indent + 4) : item}\n`;
        });
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        yaml += this.convertToYaml(value, indent + 2);
      }
    }

    return yaml;
  }
}
