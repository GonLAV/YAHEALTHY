/**
 * Dynamic Dataset Engine
 * Generates, manages, and executes parameterized test data sets
 */

export interface DataSet {
  id: string;
  name: string;
  description?: string;
  dataType: 'csv' | 'json' | 'custom' | 'formula-based';
  rows: DataRow[];
  columnDefinitions: ColumnDefinition[];
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  isActive: boolean;
}

export interface DataRow {
  rowId: string;
  values: Record<string, any>;
  metadata?: {
    description?: string;
    expectedResult?: string;
    tags?: string[];
  };
}

export interface ColumnDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'phone' | 'date' | 'enum' | 'formula';
  required: boolean;
  validationRules?: ValidationRule[];
  formula?: string; // For formula-based generation
  enumValues?: string[]; // For enum type
  sampleValue?: string;
  description?: string;
}

export interface ValidationRule {
  type: 'pattern' | 'min' | 'max' | 'length' | 'custom';
  value: any;
  message: string;
}

export interface TestDataSet {
  dataSet: DataSet;
  rowIndex: number;
  data: Record<string, any>;
}

export class DatasetEngine {
  private dataSets: Map<string, DataSet> = new Map();
  private executionContext: Record<string, any> = {};

  /**
   * Create dataset from CSV data
   */
  createFromCsv(
    name: string,
    csvData: string,
    options?: { description?: string; tags?: string[] }
  ): DataSet {
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());

    // Create column definitions
    const columnDefinitions: ColumnDefinition[] = headers.map((header) => ({
      name: header,
      type: 'string',
      required: true,
    }));

    // Parse data rows
    const rows: DataRow[] = lines.slice(1).map((line, idx) => {
      const values: Record<string, any> = {};
      const cells = line.split(',');
      headers.forEach((header, cellIdx) => {
        values[header] = cells[cellIdx]?.trim() || '';
      });

      return {
        rowId: `row_${idx}`,
        values,
      };
    });

    const dataSet: DataSet = {
      id: this.generateId(),
      name,
      description: options?.description,
      dataType: 'csv',
      rows,
      columnDefinitions,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: options?.tags,
      isActive: true,
    };

    this.dataSets.set(dataSet.id, dataSet);
    return dataSet;
  }

  /**
   * Create dataset from JSON array
   */
  createFromJson(
    name: string,
    jsonData: any[],
    options?: { description?: string; tags?: string[] }
  ): DataSet {
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      throw new Error('JSON data must be a non-empty array');
    }

    // Infer column definitions from first row
    const firstRow = jsonData[0];
    const columnDefinitions: ColumnDefinition[] = Object.keys(firstRow).map((key) => ({
      name: key,
      type: typeof firstRow[key] === 'number' ? 'number' : 'string',
      required: true,
    }));

    // Create rows
    const rows: DataRow[] = jsonData.map((item, idx) => ({
      rowId: `row_${idx}`,
      values: item,
    }));

    const dataSet: DataSet = {
      id: this.generateId(),
      name,
      description: options?.description,
      dataType: 'json',
      rows,
      columnDefinitions,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: options?.tags,
      isActive: true,
    };

    this.dataSets.set(dataSet.id, dataSet);
    return dataSet;
  }

  /**
   * Create dataset with formula-based generation
   */
  createFormulaDataSet(
    name: string,
    columnDefinitions: ColumnDefinition[],
    rowCount: number,
    options?: { description?: string; tags?: string[] }
  ): DataSet {
    const rows: DataRow[] = [];

    for (let i = 0; i < rowCount; i++) {
      const values: Record<string, any> = {};

      columnDefinitions.forEach((col) => {
        if (col.formula) {
          values[col.name] = this.evaluateFormula(col.formula, i);
        } else if (col.enumValues) {
          values[col.name] = col.enumValues[i % col.enumValues.length];
        } else if (col.type === 'email') {
          values[col.name] = `user${i}@example.com`;
        } else if (col.type === 'phone') {
          values[col.name] = `555-${String(i).padStart(4, '0')}`;
        } else if (col.type === 'number') {
          values[col.name] = i + 1;
        } else if (col.type === 'date') {
          const date = new Date();
          date.setDate(date.getDate() + i);
          values[col.name] = date.toISOString().split('T')[0];
        } else {
          values[col.name] = `${col.name}_${i}`;
        }
      });

      rows.push({
        rowId: `row_${i}`,
        values,
      });
    }

    const dataSet: DataSet = {
      id: this.generateId(),
      name,
      description: options?.description,
      dataType: 'formula-based',
      rows,
      columnDefinitions,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: options?.tags,
      isActive: true,
    };

    this.dataSets.set(dataSet.id, dataSet);
    return dataSet;
  }

  /**
   * Get dataset by ID
   */
  getDataSet(dataSetId: string): DataSet | undefined {
    return this.dataSets.get(dataSetId);
  }

  /**
   * Get data row at index
   */
  getRow(dataSetId: string, rowIndex: number): DataRow | undefined {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return undefined;
    return dataSet.rows[rowIndex];
  }

  /**
   * Iterate through dataset rows (for test execution)
   */
  iterateRows(dataSetId: string): Generator<TestDataSet> {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return;

    const generator = (function* () {
      for (let i = 0; i < dataSet.rows.length; i++) {
        yield {
          dataSet,
          rowIndex: i,
          data: dataSet.rows[i].values,
        };
      }
    })();

    return generator();
  }

  /**
   * Filter dataset rows
   */
  filterRows(dataSetId: string, predicate: (row: DataRow) => boolean): DataRow[] {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return [];

    return dataSet.rows.filter(predicate);
  }

  /**
   * Add row to dataset
   */
  addRow(dataSetId: string, values: Record<string, any>, metadata?: any): boolean {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return false;

    const newRow: DataRow = {
      rowId: `row_${Date.now()}`,
      values,
      metadata,
    };

    dataSet.rows.push(newRow);
    dataSet.updatedAt = new Date();

    return true;
  }

  /**
   * Update row in dataset
   */
  updateRow(dataSetId: string, rowIndex: number, values: Partial<Record<string, any>>): boolean {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet || !dataSet.rows[rowIndex]) return false;

    dataSet.rows[rowIndex].values = {
      ...dataSet.rows[rowIndex].values,
      ...values,
    };
    dataSet.updatedAt = new Date();

    return true;
  }

  /**
   * Remove row from dataset
   */
  removeRow(dataSetId: string, rowIndex: number): boolean {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return false;

    dataSet.rows.splice(rowIndex, 1);
    dataSet.updatedAt = new Date();

    return true;
  }

  /**
   * Validate dataset against column definitions
   */
  validateDataSet(dataSetId: string): { valid: boolean; errors: string[] } {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return { valid: false, errors: ['Dataset not found'] };

    const errors: string[] = [];

    dataSet.rows.forEach((row, rowIdx) => {
      dataSet.columnDefinitions.forEach((col) => {
        const value = row.values[col.name];

        // Check required
        if (col.required && (value === undefined || value === null || value === '')) {
          errors.push(`Row ${rowIdx}: ${col.name} is required`);
        }

        // Validate type
        if (value !== undefined && value !== null) {
          if (col.type === 'email' && !this.isValidEmail(value)) {
            errors.push(`Row ${rowIdx}: ${col.name} is not a valid email`);
          }

          if (col.type === 'number' && isNaN(Number(value))) {
            errors.push(`Row ${rowIdx}: ${col.name} is not a valid number`);
          }

          // Custom validation rules
          if (col.validationRules) {
            col.validationRules.forEach((rule) => {
              if (!this.validateRule(value, rule)) {
                errors.push(`Row ${rowIdx}: ${col.name} - ${rule.message}`);
              }
            });
          }
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export dataset as CSV
   */
  exportAsCsv(dataSetId: string): string {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return '';

    // Header row
    const headers = dataSet.columnDefinitions.map((col) => col.name).join(',');

    // Data rows
    const rows = dataSet.rows.map((row) =>
      dataSet.columnDefinitions
        .map((col) => `"${row.values[col.name] || ''}"`)
        .join(',')
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Export dataset as JSON
   */
  exportAsJson(dataSetId: string): string {
    const dataSet = this.dataSets.get(dataSetId);
    if (!dataSet) return '[]';

    return JSON.stringify(
      dataSet.rows.map((row) => row.values),
      null,
      2
    );
  }

  /**
   * Combine multiple datasets
   */
  combineDataSets(dataSetIds: string[], newName: string): DataSet | undefined {
    const dataSets = dataSetIds
      .map((id) => this.dataSets.get(id))
      .filter((ds) => ds !== undefined) as DataSet[];

    if (dataSets.length === 0) return undefined;

    // Merge rows from all datasets
    const allRows: DataRow[] = [];
    dataSets.forEach((ds) => {
      allRows.push(...ds.rows);
    });

    const combined: DataSet = {
      id: this.generateId(),
      name: newName,
      dataType: 'custom',
      rows: allRows,
      columnDefinitions: dataSets[0].columnDefinitions,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    this.dataSets.set(combined.id, combined);
    return combined;
  }

  /**
   * Private: Generate unique ID
   */
  private generateId(): string {
    return `dataset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Private: Evaluate formula
   */
  private evaluateFormula(formula: string, rowIndex: number): any {
    // Simple formula evaluation: supports {{index}} placeholder
    if (formula.includes('{{index}}')) {
      return formula.replace('{{index}}', String(rowIndex));
    }

    // Support basic math expressions
    if (formula.includes('{{index+1}}')) {
      return formula.replace('{{index+1}}', String(rowIndex + 1));
    }

    return formula;
  }

  /**
   * Private: Validate email
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Private: Validate rule
   */
  private validateRule(value: any, rule: ValidationRule): boolean {
    switch (rule.type) {
      case 'pattern':
        return new RegExp(rule.value).test(String(value));
      case 'min':
        return Number(value) >= rule.value;
      case 'max':
        return Number(value) <= rule.value;
      case 'length':
        return String(value).length === rule.value;
      case 'custom':
        // For custom validators, we assume they pass
        return true;
      default:
        return true;
    }
  }
}
