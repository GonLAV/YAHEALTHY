'use client';

import React, { useState } from 'react';
import { Upload, Download, AlertCircle } from 'lucide-react';
import { TestCase } from '@/types';
import {
  exportTestCases,
  importTestCases,
  validateTestCases,
} from '@/lib/bulk-import-export';

interface BulkImportExportProps {
  onImport: (testCases: TestCase[]) => void;
  testCases: TestCase[];
}

export const BulkImportExport: React.FC<BulkImportExportProps> = ({
  onImport,
  testCases,
}) => {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleExport = () => {
    try {
      const data = exportTestCases(testCases, format);
      const filename = `test-cases.${format === 'json' ? 'json' : 'csv'}`;
      const blob = new Blob([data], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(`Exported ${testCases.length} test cases as ${format.toUpperCase()}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      setError(null);
      const content = await file.text();
      const importFormat = file.name.endsWith('.json') ? 'json' : 'csv';

      const imported = importTestCases(content, importFormat);
      const validation = validateTestCases(imported);

      if (!validation.valid) {
        setError(`Validation errors: ${validation.errors.join('; ')}`);
        return;
      }

      onImport(imported);
      setSuccess(`Imported ${imported.length} test cases`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  return (
    <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 mb-4">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Download className="w-5 h-5" />
        Bulk Import/Export
      </h3>

      {error && (
        <div className="mb-3 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 p-3 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded">
          ✓ {success}
        </div>
      )}

      <div className="space-y-3">
        {/* Export Section */}
        <div>
          <label className="block text-sm font-medium mb-2">Export Format</label>
          <div className="flex gap-2 mb-2">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="json">JSON (Full structure)</option>
              <option value="csv">CSV (Simplified)</option>
            </select>
            <button
              onClick={handleExport}
              disabled={testCases.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {testCases.length} test cases available for export
          </p>
        </div>

        {/* Import Section */}
        <div>
          <label className="block text-sm font-medium mb-2">Import Test Cases</label>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-4 text-center">
            <input
              type="file"
              accept=".json,.csv"
              onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
              className="hidden"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-2 transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span>Click to upload or drag and drop</span>
            </label>
            <p className="text-xs text-gray-500 mt-2">JSON or CSV files up to 10MB</p>
          </div>
        </div>
      </div>
    </div>
  );
};
