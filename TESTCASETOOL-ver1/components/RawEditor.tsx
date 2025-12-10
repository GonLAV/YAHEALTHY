'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TestCase } from '@/types';
import { RawEditorParser } from '@/lib/raw-editor-parser';
import stepsUtils from '@/lib/steps-utils';
import {
  AlertCircle,
  CheckCircle,
  Copy,
  Download,
  Upload,
  Code,
} from 'lucide-react';

interface RawEditorProps {
  testCase?: TestCase;
  onSave?: (testCase: TestCase) => void;
  onModeChange?: (mode: 'raw' | 'form') => void;
}

export const RawEditor: React.FC<RawEditorProps> = ({
  testCase,
  onSave,
  onModeChange,
}) => {
  const [rawText, setRawText] = useState<string>(
    testCase ? RawEditorParser.formatRawText(testCase) : ''
  );
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
  }>({ valid: true, errors: [] });
  const [highlights, setHighlights] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Sync testCase changes from Bulk Editor to Raw Editor
  useEffect(() => {
    if (testCase && !isDirty) {
      // Only update raw text if user hasn't made local changes
      setRawText(RawEditorParser.formatRawText(testCase));
    }
  }, [testCase?.title, testCase?.description, testCase?.testSteps.length, isDirty]);

  // Validate on change
  useEffect(() => {
    const result = RawEditorParser.validateRawText(rawText);
    setValidation(result);

    const syntaxHighlights = RawEditorParser.getSyntaxHighlighting(rawText);
    setHighlights(syntaxHighlights);

    // Mark as dirty when content changes
    setIsDirty(true);
  }, [rawText]);

  const handleSave = useCallback(() => {
    if (validation.valid) {
      const parsed = RawEditorParser.parseRawText(rawText);
      // Normalize steps to ensure minimum rows and preserve attachments
      if (parsed && parsed.testSteps) {
        try {
          // parsed.testSteps may already be TestStep[]; use padSteps to ensure length
          // steps-utils works with a simple Step shape; TestStep is compatible for our purposes here
          // @ts-ignore - allow slight shape differences between TestStep and Step
          parsed.testSteps = stepsUtils.padSteps(parsed.testSteps as any);
        } catch (err) {
          // ignore normalization errors and fall back to parsed as-is
        }
      }
      onSave?.(parsed);
      setIsDirty(false);
    }
  }, [rawText, validation, onSave]);

  const handleSwitchToForm = useCallback(() => {
    // Auto-save when switching to form if there are changes and no validation errors
    if (isDirty && validation.valid) {
      const parsed = RawEditorParser.parseRawText(rawText);
      if (parsed && parsed.testSteps) {
        try {
          // Normalize steps before switching modes
          // @ts-ignore
          parsed.testSteps = stepsUtils.padSteps(parsed.testSteps as any);
        } catch (err) {
          // ignore
        }
      }
      onSave?.(parsed);
      setIsDirty(false);
    }
    // Always switch mode
    onModeChange?.('form');
  }, [rawText, validation, isDirty, onSave, onModeChange]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawText]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRawText(text);
    } catch (error) {
      console.error('Failed to read clipboard:', error);
    }
  }, []);

  const handleDownload = useCallback(() => {
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(rawText)
    );
    element.setAttribute('download', 'test_case.raw');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }, [rawText]);

  const handleUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setRawText(content);
        };
        reader.readAsText(file);
      }
    },
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full bg-white dark:bg-bolttech-dark-surface rounded-bolttech-lg border border-bolttech-border dark:border-bolttech-dark-border overflow-hidden"
      style={{
        boxShadow: '0 4px 12px rgba(51, 53, 255, 0.08)',
      }}
    >
      {/* Header with Bolttech gradient */}
      <div className="px-6 py-5 border-b border-bolttech-border dark:border-bolttech-dark-border bg-gradient-to-r from-bolttech-primary/5 to-bolttech-accent/5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-bolttech-primary/10 rounded-bolttech">
              <Code className="w-5 h-5 text-bolttech-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-bolttech-text dark:text-white">
                RAW Editor
              </h2>
              <p className="text-sm text-bolttech-text-light dark:text-bolttech-text-lighter mt-0.5">
                Paste structured text and auto-parse into test case fields
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePaste}
              className="p-2 hover:bg-bolttech-primary/10 dark:hover:bg-bolttech-primary/20 rounded-bolttech transition-all duration-250"
              title="Paste from clipboard"
            >
              <Upload className="w-4 h-4 text-bolttech-text dark:text-white" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="p-2 hover:bg-bolttech-primary/10 dark:hover:bg-bolttech-primary/20 rounded-bolttech transition-all duration-250 relative"
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4 text-bolttech-text dark:text-white" />
              {copied && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs font-medium text-bolttech-success bg-bolttech-success/10 px-2 py-1 rounded-bolttech whitespace-nowrap"
                >
                  Copied!
                </motion.span>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="p-2 hover:bg-bolttech-primary/10 dark:hover:bg-bolttech-primary/20 rounded-bolttech transition-all duration-250"
              title="Download as .raw file"
            >
              <Download className="w-4 h-4 text-bolttech-text dark:text-white" />
            </motion.button>

            <motion.label
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-bolttech-primary/10 dark:hover:bg-bolttech-primary/20 rounded-bolttech transition-all duration-250 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-bolttech-text dark:text-white" />
              <input
                type="file"
                accept=".raw,.txt"
                onChange={handleUpload}
                className="hidden"
              />
            </motion.label>
          </div>
        </div>
      </div>

      {/* Syntax Help - Bolttech info panel */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="px-6 py-3 bg-bolttech-info/5 dark:bg-bolttech-info/10 border-b border-bolttech-info/20"
      >
        <p className="text-xs text-bolttech-text-light dark:text-bolttech-text-lighter leading-relaxed">
          <strong className="text-bolttech-text dark:text-white">Syntax:</strong> Use <code className="bg-white dark:bg-bolttech-dark-bg px-1.5 py-0.5 rounded text-bolttech-primary font-mono text-xs">Key: Value</code> format.
          Sections: <code className="bg-white dark:bg-bolttech-dark-bg px-1.5 py-0.5 rounded text-bolttech-primary font-mono text-xs">Steps:</code>, <code className="bg-white dark:bg-bolttech-dark-bg px-1.5 py-0.5 rounded text-bolttech-primary font-mono text-xs">Precondition:</code>, <code className="bg-white dark:bg-bolttech-dark-bg px-1.5 py-0.5 rounded text-bolttech-primary font-mono text-xs">Postcondition:</code>. Disable lines with <code className="bg-white dark:bg-bolttech-dark-bg px-1.5 py-0.5 rounded text-bolttech-primary font-mono text-xs">//</code>
        </p>
      </motion.div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Title: My Test Case
Description: Test case description
Priority: 2
Tags: smoke, critical

Steps:
Step 1:
  Action: Navigate to home page
  Expected: Page loads successfully

Step 2:
  Action: Click login button
  Expected: Login form appears"
          className="flex-1 px-6 py-4 font-mono text-sm resize-none bg-white dark:bg-bolttech-dark-surface text-bolttech-text dark:text-white border-none outline-none focus:outline-none focus:ring-0 placeholder:text-bolttech-text-lighter dark:placeholder:text-bolttech-text-lighter/50"
        />
      </div>

      {/* Validation - Enhanced with Bolttech colors */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-6 py-4 border-t border-bolttech-border dark:border-bolttech-dark-border bg-white/50 dark:bg-bolttech-dark-surface/50"
      >
        <div className="flex items-start gap-3">
          {validation.valid ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-2 text-bolttech-success"
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Valid syntax</span>
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex-1"
            >
              <div className="flex items-center gap-2 text-bolttech-error mb-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Validation errors:</span>
              </div>
              <ul className="ml-7 space-y-1">
                {validation.errors.map((error, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="text-xs text-bolttech-error list-disc"
                  >
                    {error}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Actions - Bolttech buttons */}
      <div className="px-6 py-4 border-t border-bolttech-border dark:border-bolttech-dark-border flex gap-3 bg-bolttech-bg/30 dark:bg-bolttech-dark-bg/30">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={!validation.valid}
          className="px-5 py-2.5 bg-gradient-to-r from-bolttech-primary to-bolttech-accent hover:shadow-bolttech-hover disabled:from-bolttech-border disabled:to-bolttech-border disabled:cursor-not-allowed text-white rounded-bolttech font-semibold transition-all duration-250 flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Save & Parse
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSwitchToForm}
          className={`px-5 py-2.5 border-2 rounded-bolttech font-semibold transition-all duration-250 flex items-center gap-2 ${
            isDirty && validation.valid
              ? 'border-bolttech-warning text-bolttech-warning bg-bolttech-warning/5 dark:bg-bolttech-warning/10 hover:bg-bolttech-warning/15'
              : 'border-bolttech-primary text-bolttech-primary bg-white dark:bg-bolttech-dark-surface hover:bg-bolttech-primary/5 dark:hover:bg-bolttech-primary/10'
          }`}
          title={isDirty ? 'Unsaved changes will be parsed and transferred to Bulk Editor' : 'Switch to Bulk Editor'}
        >
          {isDirty && validation.valid && <AlertCircle className="w-4 h-4" />}
          Switch to Form {isDirty && validation.valid && '(Auto-saves)'}
        </motion.button>
      </div>
    </motion.div>
  );
};

