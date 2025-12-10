'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TestCase, TestStep } from '@/types';
import {
  Trash2,
  Plus,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface BulkEditorProps {
  testCase: TestCase;
  onChange: (testCase: TestCase) => void;
}

export const BulkEditor: React.FC<BulkEditorProps> = ({
  testCase,
  onChange,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const updateStep = (index: number, step: Partial<TestStep>) => {
    const newSteps = [...testCase.testSteps];
    newSteps[index] = { ...newSteps[index], ...step };
    onChange({ ...testCase, testSteps: newSteps });
  };

  const deleteStep = (index: number) => {
    const newSteps = testCase.testSteps.filter((_, i) => i !== index);
    onChange({ ...testCase, testSteps: newSteps });
  };

  const addStep = () => {
    const newStep: TestStep = {
      action: '',
      expectedResult: '',
      order: testCase.testSteps.length + 1,
    };
    onChange({ ...testCase, testSteps: [...testCase.testSteps, newStep] });
  };

  const moveStep = (fromIndex: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && fromIndex === 0) ||
      (direction === 'down' && fromIndex === testCase.testSteps.length - 1)
    ) {
      return;
    }

    const newSteps = [...testCase.testSteps];
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    [newSteps[fromIndex], newSteps[toIndex]] = [
      newSteps[toIndex],
      newSteps[fromIndex],
    ];

    // Update order
    newSteps.forEach((step, idx) => {
      step.order = idx + 1;
    });

    onChange({ ...testCase, testSteps: newSteps });
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      const newSteps = [...testCase.testSteps];
      const draggedStep = newSteps[draggedIndex];
      newSteps.splice(draggedIndex, 1);
      newSteps.splice(index, 0, draggedStep);
      newSteps.forEach((step, idx) => {
        step.order = idx + 1;
      });
      onChange({ ...testCase, testSteps: newSteps });
      setDraggedIndex(index);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Test Steps Editor
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Spreadsheet-style editing with drag-and-drop reordering
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          {/* Column Headers */}
          <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-12 gap-3 px-6 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              <div className="col-span-1">#</div>
              <div className="col-span-1">Drag</div>
              <div className="col-span-5">Action</div>
              <div className="col-span-4">Expected Result</div>
              <div className="col-span-1">Actions</div>
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {testCase.testSteps.map((step, index) => (
              <motion.div
                key={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-12 gap-3 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-l-4 border-blue-500"
              >
                {/* Step Number */}
                <div className="col-span-1 flex items-center justify-center font-semibold text-slate-900 dark:text-white">
                  {index + 1}
                </div>

                {/* Drag Handle */}
                <div className="col-span-1 flex items-center justify-center cursor-move hover:text-blue-600">
                  <GripVertical className="w-4 h-4 text-slate-400" />
                </div>

                {/* Action Input */}
                <div className="col-span-5">
                  <textarea
                    value={step.action}
                    onChange={(e) =>
                      updateStep(index, { action: e.target.value })
                    }
                    placeholder="e.g., Click login button"
                    rows={1}
                    onInput={(e) => {
                      const ta = e.currentTarget as HTMLTextAreaElement;
                      ta.style.height = '0px';
                      ta.style.height = ta.scrollHeight + 'px';
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none overflow-hidden"
                  />
                  {step.testData && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Data: {step.testData}
                    </div>
                  )}
                </div>

                {/* Expected Result Input */}
                <div className="col-span-4">
                  <textarea
                    value={step.expectedResult}
                    onChange={(e) =>
                      updateStep(index, { expectedResult: e.target.value })
                    }
                    placeholder="e.g., Login form appears"
                    rows={1}
                    onInput={(e) => {
                      const ta = e.currentTarget as HTMLTextAreaElement;
                      ta.style.height = '0px';
                      ta.style.height = ta.scrollHeight + 'px';
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none overflow-hidden"
                  />
                </div>

                {/* Action Buttons */}
                <div className="col-span-1 flex items-center gap-1">
                  <button
                    onClick={() => moveStep(index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:text-slate-300 rounded transition-colors"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveStep(index, 'down')}
                    disabled={index === testCase.testSteps.length - 1}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:text-slate-300 rounded transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteStep(index)}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Step Button */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={addStep}
          className="w-full px-4 py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Test Step
        </button>
      </div>
    </motion.div>
  );
};
