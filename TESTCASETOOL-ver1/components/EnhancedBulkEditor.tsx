'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TestCase, TestStep, Attachment } from '@/types';
import {
  Trash2,
  Plus,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Paperclip,
  Eye,
  X,
  Zap,
  Download,
} from 'lucide-react';

interface EnhancedBulkEditorProps {
  testCase: TestCase;
  onChange: (testCase: TestCase) => void;
}

export const EnhancedBulkEditor: React.FC<EnhancedBulkEditorProps> = ({
  testCase,
  onChange,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    stepIndex: number;
    url: string;
  } | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showFieldsMenu, setShowFieldsMenu] = useState(false);

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
      attachments: [],
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

  const handleImageUpload = (stepIndex: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const newSteps = [...testCase.testSteps];
      if (!newSteps[stepIndex].attachments) {
        newSteps[stepIndex].attachments = [];
      }
      newSteps[stepIndex].attachments!.push({
        name: file.name,
        type: 'screenshot',
        content: base64,
        uploadedDate: new Date().toISOString(),
      });
      onChange({ ...testCase, testSteps: newSteps });
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (stepIndex: number, attachIndex: number) => {
    const newSteps = [...testCase.testSteps];
    newSteps[stepIndex].attachments = newSteps[stepIndex].attachments?.filter(
      (_, i) => i !== attachIndex
    );
    onChange({ ...testCase, testSteps: newSteps });
  };

  const parsePasteText = () => {
    // Smart parser: "step login to user:user is login"
    // Format: "step <action>:<expected>"
    const lines = pasteText.split('\n').filter((l) => l.trim());
    const newSteps: TestStep[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) return;

      // Try to match "step <action>:<expected>" pattern
      const stepMatch = trimmed.match(/^step\s+(.+?):\s*(.+)$/i);
      if (stepMatch) {
        newSteps.push({
          action: stepMatch[1].trim(),
          expectedResult: stepMatch[2].trim(),
          order: testCase.testSteps.length + newSteps.length + 1,
          attachments: [],
        });
      } else if (trimmed.includes(':')) {
        // Alternative format: "action:expected"
        const [action, expected] = trimmed.split(':').map((s) => s.trim());
        if (action && expected) {
          newSteps.push({
            action,
            expectedResult: expected,
            order: testCase.testSteps.length + newSteps.length + 1,
            attachments: [],
          });
        }
      }
    });

    if (newSteps.length > 0) {
      onChange({
        ...testCase,
        testSteps: [...testCase.testSteps, ...newSteps],
      });
      setPasteText('');
      setShowPasteModal(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
    >
      {/* Header with Title at Top */}
      <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Test Case Details
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {testCase.title || 'Create your test case'}
            </p>
          </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowFieldsMenu(!showFieldsMenu)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors text-sm"
                  title="Fields"
                >
                  Fields
                </button>

                {showFieldsMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-lg p-3 z-40">
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Automation Status</label>
                      <select
                        value={testCase.automation || ''}
                        onChange={(e) => onChange({ ...testCase, automation: e.target.value as any })}
                        className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-sm"
                      >
                        <option value="">(unset)</option>
                        <option value="Not Automated">Not Automated</option>
                        <option value="Planned">Planned</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Automated">Automated</option>
                      </select>
                    </div>

                    <div className="mb-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priority</label>
                      <select
                        value={typeof testCase.priority === 'number' ? String(testCase.priority) : '2'}
                        onChange={(e) => onChange({ ...testCase, priority: parseInt(e.target.value, 10) })}
                        className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-sm"
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                      </select>
                    </div>

                    <div className="flex justify-end">
                      <button onClick={() => setShowFieldsMenu(false)} className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-800 rounded">Close</button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowPasteModal(true)}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Zap className="w-4 h-4" />
                Smart Paste
              </button>
            </div>
        </div>

        {/* Title and Description */}
        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Test Case Title
            </label>
            <input
              type="text"
              value={testCase.title}
              onChange={(e) =>
                onChange({ ...testCase, title: e.target.value })
              }
              placeholder="Enter test case title"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={testCase.description || ''}
              onChange={(e) =>
                onChange({ ...testCase, description: e.target.value })
              }
              placeholder="Describe what this test case verifies"
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Test Steps Section */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Test Steps
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Define the steps, expected results, and attach screenshots
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
              <div className="col-span-4">Action</div>
              <div className="col-span-4">Expected Result</div>
              <div className="col-span-2">Attachments</div>
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
                className="block"
              >
                <div className="grid grid-cols-12 gap-3 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-l-4 border-blue-500">
                  {/* Step Number */}
                  <div className="col-span-1 flex items-center justify-center font-semibold text-slate-900 dark:text-white">
                    {index + 1}
                  </div>

                  {/* Drag Handle */}
                  <div className="col-span-1 flex items-center justify-center cursor-move hover:text-blue-600">
                    <GripVertical className="w-4 h-4 text-slate-400" />
                  </div>

                  {/* Action Input */}
                  <div className="col-span-4">
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
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:text-white resize-none overflow-hidden"
                      />
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
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:text-white resize-none overflow-hidden"
                    />
                  </div>

                  {/* Attachments Column */}
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="relative cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleImageUpload(index, file);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                      />
                      <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-blue-500 rounded-lg flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 transition-colors">
                        <Paperclip className="w-4 h-4" />
                        Attach
                      </div>
                    </label>

                    {step.attachments && step.attachments.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {step.attachments.length}
                        </span>
                        {step.attachments.map((att, attIdx) => (
                          <button
                            key={attIdx}
                            onClick={() =>
                              setPreviewImage({
                                stepIndex: index,
                                url: att.content || '',
                              })
                            }
                            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
                            title={att.name}
                          >
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 ml-auto">
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
                  </div>
                </div>

                {/* Attachments List */}
                {step.attachments && step.attachments.length > 0 && (
                  <div className="px-6 py-2 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Attached files:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {step.attachments.map((att, attIdx) => (
                        <div
                          key={attIdx}
                          className="inline-flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs"
                        >
                          <span className="text-blue-700 dark:text-blue-300">
                            📷 {att.name}
                          </span>
                          <button
                            onClick={() => removeAttachment(index, attIdx)}
                            className="text-blue-600 hover:text-red-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

      {/* Smart Paste Modal */}
      <AnimatePresence>
        {showPasteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-lg w-full mx-4 border border-slate-200 dark:border-slate-700"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Smart Paste Steps
              </h3>

              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Paste steps in format:{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs">
                  step action:expected result
                </code>
                <br />
                Or simply: <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs">
                  action:expected
                </code>
              </p>

              <div className="space-y-4">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Examples:
step login to user:user is login
step click submit:form submits
action:expected result`}
                  rows={8}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                />

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowPasteModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={parsePasteText}
                    disabled={!pasteText.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium transition-colors"
                  >
                    Parse & Add Steps
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Preview Modal - Full Screen */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-full max-w-7xl max-h-[98vh] bg-slate-950 rounded-lg flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-700">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white">Screenshot Preview</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {previewImage.stepIndex !== undefined ? `Step ${previewImage.stepIndex + 1}` : 'Preview'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      // Download image
                      const link = document.createElement('a');
                      link.href = previewImage.url;
                      link.download = `screenshot-${Date.now()}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-300 hover:text-white"
                    title="Download"
                  >
                    <Download className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-300 hover:text-white"
                    title="Close"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Image Container */}
              <div className="flex-1 flex items-center justify-center overflow-auto p-6">
                <img
                  src={previewImage.url}
                  alt="Screenshot"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
