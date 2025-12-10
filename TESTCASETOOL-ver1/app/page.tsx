'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  Settings,
  FileJson,
  BarChart3,
  Plus,
  LogOut,
  Menu,
  X,
  Code,
  Edit3,
  Zap,
} from 'lucide-react';
import { AzureDevOpsConfig } from '@/components/AzureDevOpsConfig';
import { RawEditor } from '@/components/RawEditor';
import { BulkEditor } from '@/components/BulkEditor';
import { EnhancedBulkEditor } from '@/components/EnhancedBulkEditor';
import { ApiRequestExecutor } from '@/components/ApiRequestExecutor';
import { AzureDevOpsClient } from '@/lib/azure-devops';
import { RawEditorParser } from '@/lib/raw-editor-parser';
import { TestCase, AzureDevOpsConfig as ADOConfig } from '@/types';
import { padSteps, stepsToXml } from '@/lib/steps-utils';
import stepsAdapter from '@/lib/steps-adapter';

type Mode = 'config' | 'dashboard' | 'create' | 'raw-editor' | 'bulk-editor' | 'api-executor';
type EditorMode = 'raw' | 'form';

export default function Home() {
    // Templates state
    const [templates, setTemplates] = useState<Array<{ name: string; steps: any[] }>>([]);
    const [showTemplatesModal, setShowTemplatesModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');

    // Load templates from localStorage
    useEffect(() => {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('testCaseTemplates') : null;
      if (stored) {
        setTemplates(JSON.parse(stored));
      }
    }, []);

    // Save templates to localStorage
    useEffect(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('testCaseTemplates', JSON.stringify(templates));
      }
    }, [templates]);

    // Add new template
    const handleSaveTemplate = () => {
      if (!newTemplateName.trim()) return;
      setTemplates([...templates, { name: newTemplateName.trim(), steps: currentTestCase.testSteps }]);
      setNewTemplateName('');
      setShowTemplatesModal(false);
    };

    // Insert template steps into current test case
    const handleInsertTemplate = (templateSteps: any[]) => {
      setCurrentTestCase({ ...currentTestCase, testSteps: [...currentTestCase.testSteps, ...templateSteps] });
      setShowTemplatesModal(false);
    };

    // Delete template
    const handleDeleteTemplate = (idx: number) => {
      setTemplates(templates.filter((_, i) => i !== idx));
    };
  const [mode, setMode] = useState<Mode>('config');
  const [editorMode, setEditorMode] = useState<EditorMode>('raw');
  const [config, setConfig] = useState<ADOConfig | null>(null);
  const [client, setClient] = useState<AzureDevOpsClient | null>(null);
  const [currentTestCase, setCurrentTestCase] = useState<TestCase>({
    title: '',
    description: '',
    testSteps: padSteps([]),
    tags: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleConnect = useCallback(async (adoConfig: ADOConfig) => {
    try {
      setLoading(true);
      setError(null);

      // Validate config
      const testClient = new AzureDevOpsClient(adoConfig);

      // Try to fetch test plans to verify connection
      await testClient.getTestPlans();

      setConfig(adoConfig);
      setClient(testClient);
      setMode('dashboard');
      setSuccessMessage('Successfully connected to Azure DevOps!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to connect to Azure DevOps';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaveTestCase = useCallback(
    async (testCase: TestCase) => {
      try {
        setLoading(true);
        setError(null);

        if (!client) {
          throw new Error('No Azure DevOps client initialized');
        }

        // Ensure steps are padded and properly formed before save
        const tcToSave = { ...testCase, testSteps: padSteps(testCase.testSteps) };

        if (testCase.id) {
          // Update existing
          await client.updateTestCase(testCase.id, tcToSave);
          setSuccessMessage('Test case updated successfully!');
        } else {
          // Create new
          const created = await client.createTestCase(tcToSave);
          setCurrentTestCase({ ...created, testSteps: padSteps(created.testSteps) });
          setSuccessMessage('Test case created successfully!');
        }

        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save test case');
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const handleDisconnect = useCallback(() => {
    setConfig(null);
    setClient(null);
    setMode('config');
    setCurrentTestCase({
      title: '',
      description: '',
      testSteps: padSteps([]),
      tags: [],
    });
  }, []);

  if (mode === 'config') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <Zap className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
              BolTest Test Case Tool
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            It's so simple
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
            Made by Gon Shaul lavan
          </p>
        </motion.div>
        <AzureDevOpsConfig
          onConnect={handleConnect}
          isLoading={loading}
          error={error || undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 overflow-hidden">
      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-2">Templates</h3>
            <div className="mb-4">
              <input
                type="text"
                className="w-full px-2 py-1 border rounded"
                placeholder="New template name"
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
              />
              <button
                className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                onClick={handleSaveTemplate}
              >
                Save Current Steps as Template
              </button>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Saved Templates</h4>
              {templates.length === 0 && <div className="text-gray-500">No templates yet.</div>}
              <ul>
                {templates.map((tpl, idx) => (
                  <li key={tpl.name + idx} className="flex items-center justify-between mb-2">
                    <span>{tpl.name}</span>
                    <div>
                      <button
                        className="mr-2 px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        onClick={() => handleInsertTemplate(tpl.steps)}
                      >Insert</button>
                      <button
                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        onClick={() => handleDeleteTemplate(idx)}
                      >Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <button
              className="mt-4 px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 w-full"
              onClick={() => setShowTemplatesModal(false)}
            >Close</button>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            className="w-80 bg-slate-900 dark:bg-slate-950 border-r border-slate-800 flex flex-col"
          >
            {/* Sidebar Header */}
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-6 h-6 text-blue-400" />
                <h1 className="text-xl font-bold text-white">Test Tool</h1>
              </div>
              <p className="text-xs text-slate-400 mb-2">Made by Gon Shaul Lavan</p>
              <p className="text-sm text-slate-400">
                Project: <span className="font-semibold">{config?.projectName}</span>
              </p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-auto p-4 space-y-2">
              <SidebarButton
                icon={<LayoutGrid className="w-5 h-5" />}
                label="Dashboard"
                active={mode === 'dashboard'}
                onClick={() => setMode('dashboard')}
              />
              <SidebarButton
                icon={<Plus className="w-5 h-5" />}
                label="Create Test Case"
                active={mode === 'create'}
                onClick={() => {
                  setMode('create');
                  setEditorMode('raw');
                  setCurrentTestCase({
                    title: '',
                    description: '',
                    testSteps: padSteps([]),
                    tags: [],
                  });
                }}
              />
              {/* RAW / Bulk are available inside Create Test Case for a simpler workflow */}
              <SidebarButton
                icon={<Code className="w-5 h-5" />}
                label="API Executor"
                active={mode === 'api-executor'}
                onClick={() => setMode('api-executor')}
              />
              <SidebarButton
                icon={<BarChart3 className="w-5 h-5" />}
                label="Analytics"
                active={false}
                onClick={() => {}}
                disabled
              />
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 space-y-2">
              <SidebarButton
                icon={<Settings className="w-5 h-5" />}
                label="Settings"
                active={false}
                onClick={() => {}}
                disabled
              />
              <SidebarButton
                icon={<LogOut className="w-5 h-5" />}
                label="Disconnect"
                active={false}
                onClick={handleDisconnect}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-6 gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {sidebarOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>

          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {getModeTitle(mode)}
            </h2>
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="px-4 py-2 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium"
              >
                ✓ {successMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium"
              >
                ✕ {error}
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          <AnimatePresence mode="wait">
            {mode === 'dashboard' && (
              <DashboardView key="dashboard" client={client} config={config} />
            )}

            {mode === 'create' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold">Create Test Case</h2>
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={() => setShowTemplatesModal(true)}
                  >
                    Templates
                  </button>
                </div>
                <CreateTestCaseView
                  key="create"
                  editorMode={editorMode}
                  testCase={currentTestCase}
                  onTestCaseChange={setCurrentTestCase}
                  onModeChange={setEditorMode}
                  onSave={handleSaveTestCase}
                  isLoading={loading}
                />
              </>
            )}

            {mode === 'raw-editor' && (
              <RawEditor
                key="raw"
                testCase={currentTestCase}
                onSave={(tc) => {
                  // Normalize steps on save from raw editor
                  setCurrentTestCase({ ...tc, testSteps: padSteps(tc.testSteps) });
                  setSuccessMessage('Test case parsed successfully!');
                  setTimeout(() => setSuccessMessage(null), 2000);
                }}
              />
            )}

            {mode === 'bulk-editor' && (
              <EnhancedBulkEditor
                key="bulk"
                testCase={currentTestCase}
                onChange={(tc) => {
                  // Normalize steps after any bulk edit
                  setCurrentTestCase({ ...tc, testSteps: padSteps(tc.testSteps) });
                }}
              />
            )}

            {mode === 'api-executor' && (
              <ApiRequestExecutor
                key="api"
                baseUrl={config?.organizationUrl}
                patToken={config?.patToken}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// Helper Components

interface SidebarButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function SidebarButton({
  icon,
  label,
  active,
  onClick,
  disabled = false,
}: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
}

interface DashboardViewProps {
  client: AzureDevOpsClient | null;
  config: ADOConfig | null;
}

function DashboardView({ client, config }: DashboardViewProps) {
  const [stats, setStats] = useState({
    testPlans: 0,
    testCases: 0,
    testRuns: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!client) return;
      try {
        const plans = await client.getTestPlans();
        setStats({
          testPlans: plans.length,
          testCases: 0,
          testRuns: 0,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [client]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Test Plans"
          value={stats.testPlans}
          icon={<LayoutGrid className="w-6 h-6" />}
        />
        <StatCard
          title="Test Cases"
          value={stats.testCases}
          icon={<FileJson className="w-6 h-6" />}
        />
        <StatCard
          title="Test Runs"
          value={stats.testRuns}
          icon={<Zap className="w-6 h-6" />}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Getting Started
        </h3>
        <ol className="space-y-3 text-slate-600 dark:text-slate-400">
          <li className="flex gap-3">
            <span className="font-semibold text-blue-600">1.</span>
            <span>Create a new test case using RAW Editor or Bulk Editor</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-blue-600">2.</span>
            <span>Use the API Executor to debug Azure DevOps API calls</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-blue-600">3.</span>
            <span>View and manage all test cases in the dashboard</span>
          </li>
        </ol>
      </div>
    </motion.div>
  );
}

interface CreateTestCaseViewProps {
  editorMode: EditorMode;
  testCase: TestCase;
  onTestCaseChange: (tc: TestCase) => void;
  onModeChange: (mode: EditorMode) => void;
  onSave: (tc: TestCase) => void;
  isLoading: boolean;
}

function CreateTestCaseView({
  editorMode,
  testCase,
  onTestCaseChange,
  onModeChange,
  onSave,
  isLoading,
}: CreateTestCaseViewProps) {
  const [rawText, setRawText] = useState<string>('');

  // Import raw text as steps into bulk editor using x-www-form-urlencoded format
  const handleImportRawToBulk = useCallback(() => {
    if (!rawText.trim()) return;
    
    // Parse using RawEditorParser which handles key:value format and disabled rows
    const parseResult = RawEditorParser.parseRawText(rawText);
    
    if (parseResult && parseResult.testSteps && parseResult.testSteps.length > 0) {
      // Pad the steps first (expects Step[] format compatible with TestStep[])
      const paddedSteps = padSteps(parseResult.testSteps as any);
      // Convert to TestStep[] using adapter
      const testSteps = stepsAdapter.toTestSteps(paddedSteps as any);
      
      // Merge parsed data with current test case metadata
      const updatedTestCase: TestCase = {
        ...testCase,
        title: parseResult.title || testCase.title,
        description: parseResult.description || testCase.description,
        tags: parseResult.tags && parseResult.tags.length > 0 ? parseResult.tags : testCase.tags,
        testSteps: testSteps,
      };
      onTestCaseChange(updatedTestCase);
      onModeChange('form');
    }
  }, [rawText, testCase, onTestCaseChange, onModeChange]);

  // RAW Editor Mode: 70% editor, 30% quick import
  if (editorMode === 'raw') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => onModeChange('raw')}
            className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white"
          >
            RAW Mode
          </button>
          <button
            onClick={() => onModeChange('form')}
            className="px-4 py-2 rounded-lg font-medium bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            Bulk Editor
          </button>
        </div>

        {/* Split view: RAW Editor 70%, Quick Import 30% */}
        <div className="flex gap-4 h-[70vh]">
          {/* RAW Editor - 70% */}
          <div className="w-7/12">
            <RawEditor
              testCase={testCase}
              onSave={onTestCaseChange}
              onModeChange={onModeChange}
            />
          </div>

          {/* Quick Import Panel - 30% */}
          <div className="w-5/12 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 flex flex-col overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Import to Bulk</h3>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste raw steps (x-www-form-urlencoded style):

action: Click login button
expected: User is logged in

action: Verify home page
expected: Page loads successfully

// action: This step is disabled
// expected: Won't be imported`}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm mb-4"
            />
            <button
              onClick={handleImportRawToBulk}
              disabled={!rawText.trim()}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              Import to Bulk Editor
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              <strong>Format:</strong> key: value pairs, one per line. Prepend <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">// </code> to disable rows. Empty lines separate steps.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Bulk Editor Mode
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => onModeChange('raw')}
          className="px-4 py-2 rounded-lg font-medium bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          RAW Mode
        </button>
        <button
          onClick={() => onModeChange('form')}
          className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white"
        >
          Bulk Editor
        </button>
      </div>

      {/* Bulk Editor View */}
      <>
        <EnhancedBulkEditor testCase={testCase} onChange={onTestCaseChange} />

        <div className="mt-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => onSave(testCase)}
              disabled={isLoading || !testCase.title || testCase.testSteps.length === 0}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save to Azure DevOps'}
            </button>

            <button
              onClick={() => {
                const xml = stepsToXml(stepsAdapter.fromTestSteps(testCase.testSteps));
                const element = document.createElement('a');
                element.setAttribute('href', 'data:text/xml;charset=utf-8,' + encodeURIComponent(xml));
                element.setAttribute('download', `${testCase.title || 'test-case'}_steps.xml`);
                element.style.display = 'none';
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
              }}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              Download XML
            </button>
          </div>
        </div>
      </>
    </motion.div>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}

function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {title}
          </p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
            {value}
          </p>
        </div>
        <div className="text-blue-600 dark:text-blue-400 opacity-20">
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

function getModeTitle(mode: Mode): string {
  const titles: Record<Mode, string> = {
    config: 'Configuration',
    dashboard: 'Dashboard',
    create: 'Create Test Case',
    'raw-editor': 'RAW Editor',
    'bulk-editor': 'Bulk Editor',
    'api-executor': 'API Request Executor',
  };
  return titles[mode] || 'BolTest Test Case Tool';
}
