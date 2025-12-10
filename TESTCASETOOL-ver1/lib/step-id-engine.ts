/**
 * Step ID Stability Engine
 * Preserves step IDs when reordering and handles renumbering safely
 */

import { TestStep } from '@/types';

export interface StepWithId extends TestStep {
  stableId?: string; // Preserved across reorders
}

export class StepIdStabilityEngine {
  /**
   * Create stable ID for new step
   */
  static createStableId(stepOrder: number, timestamp: number = Date.now()): string {
    return `step_${timestamp}_${stepOrder}`;
  }

  /**
   * Reorder steps while preserving stable IDs
   */
  static reorderSteps(
    steps: StepWithId[],
    fromIndex: number,
    toIndex: number
  ): StepWithId[] {
    const newSteps = [...steps];
    const [removed] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, removed);

    // Update order numbers but preserve stable IDs
    return newSteps.map((step, idx) => ({
      ...step,
      order: idx + 1,
      // Keep stableId unchanged
    }));
  }

  /**
   * Add new step with stable ID
   */
  static addStep(
    steps: StepWithId[],
    action: string,
    expectedResult: string,
    position?: number
  ): StepWithId[] {
    const newStep: StepWithId = {
      order: (steps.length || 0) + 1,
      action,
      expectedResult,
      stableId: this.createStableId((steps.length || 0) + 1),
    };

    if (position !== undefined && position >= 0 && position <= steps.length) {
      const newSteps = [...steps];
      newSteps.splice(position, 0, newStep);
      return newSteps.map((step, idx) => ({ ...step, order: idx + 1 }));
    }

    return [...steps, newStep];
  }

  /**
   * Remove step while preserving other IDs
   */
  static removeStep(steps: StepWithId[], index: number): StepWithId[] {
    return steps
      .filter((_, idx) => idx !== index)
      .map((step, idx) => ({ ...step, order: idx + 1 }));
  }

  /**
   * Convert ADO step XML to internal format
   */
  static parseAdoSteps(xmlString: string): StepWithId[] {
    if (!xmlString) return [];

    const steps: StepWithId[] = [];
    const stepRegex = /<step\s+id="(\d+)"[^>]*>(.*?)<\/step>/gs;
    let match;

    let index = 0;
    while ((match = stepRegex.exec(xmlString)) !== null) {
      const id = match[1];
      const content = match[2];

      const descMatch = content.match(/<description>(.*?)<\/description>/s);
      const expectedMatch = content.match(/<expectedResult>(.*?)<\/expectedResult>/s);

      steps.push({
        order: index + 1,
        action: descMatch ? this.unescapeXml(descMatch[1]) : '',
        expectedResult: expectedMatch ? this.unescapeXml(expectedMatch[1]) : '',
        stableId: `step_ado_${id}`, // Preserve ADO step ID
      });

      index++;
    }

    return steps;
  }

  /**
   * Convert internal steps to ADO XML format
   * Preserves original step IDs
   */
  static toAdoXml(steps: StepWithId[]): string {
    let xml = '<steps>';

    steps.forEach((step) => {
      // Extract original ADO ID if available
      const adoId = step.stableId?.startsWith('step_ado_')
        ? step.stableId.replace('step_ado_', '')
        : step.order;

      const action = this.escapeXml(step.action || '');
      const expected = this.escapeXml(step.expectedResult || '');

      xml += `<step id="${adoId}">`;
      xml += '<parameterizedProperties><new /></parameterizedProperties>';
      xml += `<description>${action}</description>`;
      xml += `<expectedResult>${expected}</expectedResult>`;
      xml += '</step>';
    });

    xml += '</steps>';
    return xml;
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(text: string): string {
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

  /**
   * Unescape XML entities
   */
  private static unescapeXml(text: string): string {
    const map: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    };

    return text.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => map[m]);
  }

  /**
   * Detect if step order changed
   */
  static hasOrderChanged(
    original: StepWithId[],
    modified: StepWithId[]
  ): boolean {
    if (original.length !== modified.length) return true;

    for (let i = 0; i < original.length; i++) {
      if (original[i].stableId !== modified[i].stableId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Merge steps preserving IDs (for conflict resolution)
   */
  static mergeSteps(
    serverSteps: StepWithId[],
    clientSteps: StepWithId[]
  ): { merged: StepWithId[]; conflicts: string[] } {
    const conflicts: string[] = [];
    const merged: Map<string, StepWithId> = new Map();

    // Add server steps
    serverSteps.forEach((step) => {
      merged.set(step.stableId || `step_${step.order}`, step);
    });

    // Check for conflicts in client steps
    clientSteps.forEach((step) => {
      const key = step.stableId || `step_${step.order}`;
      const existing = merged.get(key);

      if (existing) {
        if (existing.action !== step.action ||
            existing.expectedResult !== step.expectedResult) {
          conflicts.push(`Step ${step.order}: Different content on server and client`);
        }
      }

      merged.set(key, step);
    });

    const result = Array.from(merged.values())
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((step, idx) => ({ ...step, order: idx + 1 }));

    return { merged: result, conflicts };
  }
}
