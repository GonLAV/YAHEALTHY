/**
 * Multi-User Edit Conflict Detector
 * Detects and resolves conflicts when multiple users edit same test case
 */

import { TestCase } from '@/types';

export interface ConflictMetadata {
  testCaseId: number;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  version: number;
  hash: string;
}

export interface EditConflict {
  fieldName: string;
  serverValue: any;
  clientValue: any;
  baseValue: any;
  conflictType: 'update-update' | 'update-delete' | 'delete-update';
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface ConflictResolutionStrategy {
  strategy: 'server-wins' | 'client-wins' | 'manual' | 'merge';
  selectiveFields?: string[];
}

export interface MergeResult {
  resolved: boolean;
  mergedTestCase?: TestCase;
  conflicts: EditConflict[];
  resolutionStrategy: ConflictResolutionStrategy;
}

export class ConflictDetector {
  /**
   * Detect conflicts between client and server versions
   */
  static detectConflicts(
    clientTestCase: TestCase,
    serverTestCase: TestCase,
    baseTestCase: TestCase
  ): EditConflict[] {
    const conflicts: EditConflict[] = [];

    // Check each field for conflicts
    const fields = [
      'name',
      'description',
      'steps',
      'priority',
      'assignedTo',
      'tags',
      'precondition',
      'postcondition',
      'automationStatus',
    ];

    fields.forEach((field) => {
      const clientVal = (clientTestCase as any)[field];
      const serverVal = (serverTestCase as any)[field];
      const baseVal = (baseTestCase as any)[field];

      // Check for concurrent modifications
      if (!this.deepEqual(clientVal, baseVal) && !this.deepEqual(serverVal, baseVal)) {
        // Both client and server modified the same field
        conflicts.push({
          fieldName: field,
          clientValue: clientVal,
          serverValue: serverVal,
          baseValue: baseVal,
          conflictType: 'update-update',
          severity: this.calculateSeverity(field),
          suggestion: this.generateSuggestion(field, clientVal, serverVal),
        });
      }

      // Check for delete-update conflicts
      if (
        clientVal === undefined ||
        clientVal === null
      ) {
        if (
          serverVal !== undefined &&
          serverVal !== null &&
          !this.deepEqual(serverVal, baseVal)
        ) {
          conflicts.push({
            fieldName: field,
            clientValue: clientVal,
            serverValue: serverVal,
            baseValue: baseVal,
            conflictType: 'delete-update',
            severity: 'high',
            suggestion: `Server has newer value for ${field}. Use server value or confirm deletion.`,
          });
        }
      }

      // Check for update-delete conflicts
      if (serverVal === undefined || serverVal === null) {
        if (clientVal !== undefined && clientVal !== null && !this.deepEqual(clientVal, baseVal)) {
          conflicts.push({
            fieldName: field,
            clientValue: clientVal,
            serverValue: serverVal,
            baseValue: baseVal,
            conflictType: 'update-delete',
            severity: 'high',
            suggestion: `Server deleted ${field}, but you have unsaved changes. Confirm action.`,
          });
        }
      }
    });

    return conflicts;
  }

  /**
   * Merge conflicting versions using strategy
   */
  static mergeConflicts(
    clientTestCase: TestCase,
    serverTestCase: TestCase,
    conflicts: EditConflict[],
    strategy: ConflictResolutionStrategy
  ): MergeResult {
    let mergedTestCase = { ...serverTestCase };

    if (strategy.strategy === 'client-wins') {
      mergedTestCase = { ...clientTestCase };
    } else if (strategy.strategy === 'server-wins') {
      mergedTestCase = { ...serverTestCase };
    } else if (strategy.strategy === 'merge') {
      mergedTestCase = this.intelligentMerge(
        clientTestCase,
        serverTestCase,
        conflicts
      );
    } else if (strategy.strategy === 'manual' && strategy.selectiveFields) {
      // Manual selection - merge specific fields
      mergedTestCase = { ...serverTestCase };
      strategy.selectiveFields.forEach((field) => {
        (mergedTestCase as any)[field] = (clientTestCase as any)[field];
      });
    }

    const resolved = conflicts.length === 0 || strategy.strategy !== 'manual';

    return {
      resolved,
      mergedTestCase,
      conflicts,
      resolutionStrategy: strategy,
    };
  }

  /**
   * Intelligent three-way merge
   */
  private static intelligentMerge(
    clientTestCase: TestCase,
    serverTestCase: TestCase,
    conflicts: EditConflict[]
  ): TestCase {
    const merged = { ...serverTestCase };

    conflicts.forEach((conflict) => {
      if (conflict.conflictType === 'update-update') {
        // For text fields, try to merge
        if (typeof conflict.clientValue === 'string' && typeof conflict.serverValue === 'string') {
          // Use server value for critical fields (name, priority)
          // Use client value for additive fields (description, tags)
          if (conflict.fieldName === 'name' || conflict.fieldName === 'priority') {
            (merged as any)[conflict.fieldName] = conflict.serverValue;
          } else {
            // For description, prefer longer (more complete)
            if (
              conflict.clientValue.length > (conflict.baseValue as any)?.length
            ) {
              (merged as any)[conflict.fieldName] = conflict.clientValue;
            }
          }
        }

        // For arrays (tags, steps), merge unique items
        if (Array.isArray(conflict.clientValue) && Array.isArray(conflict.serverValue)) {
          (merged as any)[conflict.fieldName] = [
            ...new Set([...conflict.serverValue, ...conflict.clientValue]),
          ];
        }
      } else if (conflict.conflictType === 'update-delete') {
        // Server deleted, keep server value
        (merged as any)[conflict.fieldName] = conflict.serverValue;
      } else if (conflict.conflictType === 'delete-update') {
        // Server updated, keep server value
        (merged as any)[conflict.fieldName] = conflict.serverValue;
      }
    });

    return merged;
  }

  /**
   * Calculate conflict severity
   */
  private static calculateSeverity(
    field: string
  ): 'low' | 'medium' | 'high' {
    const critical = ['name', 'priority', 'automationStatus'];
    const important = ['description', 'precondition', 'postcondition'];

    if (critical.includes(field)) return 'high';
    if (important.includes(field)) return 'medium';
    return 'low';
  }

  /**
   * Generate resolution suggestion
   */
  private static generateSuggestion(
    field: string,
    clientValue: any,
    serverValue: any
  ): string {
    if (field === 'name') {
      return `Name conflict: Client has "${clientValue}", Server has "${serverValue}". Server value recommended.`;
    }

    if (field === 'steps') {
      const clientCount = (clientValue as any)?.length || 0;
      const serverCount = (serverValue as any)?.length || 0;
      return `Steps conflict: Client has ${clientCount} steps, Server has ${serverCount} steps. Review and merge manually.`;
    }

    if (field === 'tags') {
      return `Tags can be merged: Both client and server tags will be combined.`;
    }

    return `Conflict detected in ${field}. Manual review recommended.`;
  }

  /**
   * Create conflict metadata for optimistic locking
   */
  static createMetadata(testCase: TestCase): ConflictMetadata {
    return {
      testCaseId: testCase.id || 0,
      lastModifiedBy: typeof window !== 'undefined'
        ? localStorage.getItem('currentUser') || 'unknown'
        : 'unknown',
      lastModifiedAt: new Date(),
      version: (testCase as any).version || 1,
      hash: this.calculateHash(testCase),
    };
  }

  /**
   * Check if version is outdated
   */
  static isOutdated(
    clientMetadata: ConflictMetadata,
    serverMetadata: ConflictMetadata
  ): boolean {
    return clientMetadata.version < serverMetadata.version;
  }

  /**
   * Calculate content hash for change detection
   */
  static calculateHash(testCase: TestCase): string {
    const content = `${testCase.name}|${testCase.description}|${JSON.stringify(testCase.steps)}|${testCase.priority}`;

    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Deep equality check
   */
  private static deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => this.deepEqual(a[key], b[key]));
    }

    return false;
  }

  /**
   * Format conflicts for user display
   */
  static formatConflictsForDisplay(
    conflicts: EditConflict[]
  ): string {
    if (conflicts.length === 0) {
      return 'No conflicts detected.';
    }

    let display = `${conflicts.length} conflict(s) detected:\n\n`;

    conflicts.forEach((conflict, index) => {
      display += `${index + 1}. **${conflict.fieldName}** (${conflict.severity.toUpperCase()})\n`;
      display += `   Client: ${JSON.stringify(conflict.clientValue)}\n`;
      display += `   Server: ${JSON.stringify(conflict.serverValue)}\n`;
      display += `   ${conflict.suggestion}\n\n`;
    });

    return display;
  }

  /**
   * Export conflict history for audit trail
   */
  static exportConflictHistory(
    testCaseId: number,
    conflicts: EditConflict[]
  ): string {
    const report = {
      timestamp: new Date().toISOString(),
      testCaseId,
      totalConflicts: conflicts.length,
      conflicts: conflicts.map((c) => ({
        field: c.fieldName,
        type: c.conflictType,
        severity: c.severity,
        clientValue: c.clientValue,
        serverValue: c.serverValue,
        suggestion: c.suggestion,
      })),
    };

    return JSON.stringify(report, null, 2);
  }
}
