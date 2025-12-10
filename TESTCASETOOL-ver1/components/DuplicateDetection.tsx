'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { TestCase } from '@/types';
import { findSimilarTestCases } from '@/lib/duplicate-detection';

interface DuplicateDetectionProps {
  newTestCase: TestCase;
  existingTestCases: TestCase[];
  threshold?: number;
}

export const DuplicateDetection: React.FC<DuplicateDetectionProps> = ({
  newTestCase,
  existingTestCases,
  threshold = 75,
}) => {
  const [similar, setSimilar] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const results = findSimilarTestCases(newTestCase, existingTestCases, threshold);
    setSimilar(results);
  }, [newTestCase, existingTestCases, threshold]);

  if (similar.length === 0 || dismissed) {
    return null;
  }

  const topMatch = similar[0];

  return (
    <div className="border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
              Possible Duplicate Found
            </h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
              This test case is {topMatch.similarity}% similar to an existing one:
            </p>

            <div className="bg-white dark:bg-gray-800 rounded p-3 mb-3">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {topMatch.testCase.title}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Reason: {topMatch.reason}
              </p>
            </div>

            {similar.length > 1 && (
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                <p className="font-medium mb-2">Other similar test cases:</p>
                <ul className="space-y-1 ml-4">
                  {similar.slice(1, 3).map((result, idx) => (
                    <li key={idx} className="text-xs">
                      • {result.testCase.title} ({result.similarity}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                onClick={() => {
                  // Could implement merge/link logic here
                  console.log('Merge action needed');
                }}
              >
                View Similar
              </button>
              <button
                className="px-3 py-1 text-sm border border-yellow-600 text-yellow-600 dark:text-yellow-400 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                onClick={() => setDismissed(true)}
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
