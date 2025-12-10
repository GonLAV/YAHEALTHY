'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { BolttechStyles } from '@/lib/bolttech-styles';

interface ConfigFormProps {
  onConnect: (config: {
    organizationUrl: string;
    projectName: string;
    patToken: string;
    collectionName?: string;
    apiVersion?: string;
  }) => void;
  isLoading?: boolean;
  error?: string;
}

export const AzureDevOpsConfig: React.FC<ConfigFormProps> = ({
  onConnect,
  isLoading = false,
  error,
}) => {
  const [serverType, setServerType] = useState<'cloud' | 'tfs'>('cloud');
  const [orgUrl, setOrgUrl] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [patToken, setPatToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Attempt to read a persisted apiVersion for this connection
    const base = buildApiBase();
    const key = `ado:apiVersion:${base.replace(/\/_apis$/, '')}`;
    let persisted: string | null = null;
    try {
      persisted = localStorage.getItem(key);
    } catch (e) {
      persisted = null;
    }

    onConnect({
      organizationUrl: orgUrl,
      projectName: projectName,
      patToken: patToken,
      collectionName: serverType === 'tfs' ? collectionName : undefined,
      apiVersion: persisted || undefined,
    });
  };

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const buildApiBase = () => {
    try {
      const inputUrl = orgUrl.replace(/\/$/, '');
      const parsed = new URL(inputUrl);
      const origin = parsed.origin;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const tfsIndex = pathParts.indexOf('tfs');
      const collectionFromUrl = tfsIndex >= 0 && pathParts.length > tfsIndex + 1 ? pathParts[tfsIndex + 1] : undefined;
      const collection = serverType === 'tfs' ? (collectionName || collectionFromUrl) : undefined;

      if (serverType === 'tfs') {
        if (collection) {
          return `${origin}/tfs/${collection}/${projectName}/_apis`;
        }
        return `${inputUrl}/${projectName}/_apis`;
      }

      // cloud
      return `${inputUrl}/${projectName}/_apis`;
    } catch (err) {
      return `${orgUrl.replace(/\/$/, '')}/${projectName}/_apis`;
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const base = buildApiBase();
      const key = `ado:apiVersion:${base.replace(/\/_apis$/, '')}`;
      const versions = ['7.0', '6.0', '5.0', '4.1', '2.0'];
      const auth = 'Basic ' + btoa(':' + patToken);

      let output = `Constructed base: ${base}\n`;

      for (const v of versions) {
        const url = `${base}/test/plans?api-version=${v}`;
        output += `\nTrying ${url}\n`;
        try {
          const resp = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: auth,
              'Content-Type': 'application/json',
            },
          });

          output += `Status: ${resp.status} ${resp.statusText}\n`;
          const text = await resp.text();
          output += `Body (first 1000 chars): ${text.substring(0, 1000)}\n`;

          if (resp.ok) {
            output += `\nSuccess with api-version=${v}`;
            // Persist the discovered apiVersion for this connection
            try {
              localStorage.setItem(key, v);
              output += `\nPersisted apiVersion=${v} to localStorage key ${key}`;
            } catch (e) {
              // ignore storage errors
            }
            setTestResult(output);
            setIsTesting(false);
            return;
          }
        } catch (e: any) {
          output += `Error: ${e.message || e}\n`;
        }
      }

      setTestResult(output);
    } finally {
      setIsTesting(false);
    }
  };

  const isFormValid = orgUrl && projectName && patToken && (serverType === 'cloud' || collectionName);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div className={BolttechStyles.cards.elevated + ' p-8'}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-gradient-to-br from-bolttech-primary/10 to-bolttech-accent/10 rounded-bolttech-lg">
            <Settings className="w-7 h-7 text-bolttech-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-bolttech-text dark:text-white">
              Azure DevOps Setup
            </h2>
            <p className="text-sm text-bolttech-text-light dark:text-bolttech-text-lighter mt-1">
              Connect to your Azure DevOps or TFS server
            </p>
          </div>
        </div>

        {/* Server Type Selection - Bolttech Pills */}
        <div className="mb-8">
          <label className="text-sm font-semibold text-bolttech-text dark:text-white mb-3 block">
            Server Type
          </label>
          <div className="flex gap-3">
            <motion.button
              type="button"
              onClick={() => setServerType('cloud')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex-1 px-4 py-3 rounded-bolttech font-semibold transition-all duration-250 ${
                serverType === 'cloud'
                  ? 'bg-gradient-to-r from-bolttech-primary to-bolttech-accent text-white shadow-bolttech-hover'
                  : 'bg-bolttech-bg dark:bg-bolttech-dark-surface text-bolttech-text dark:text-white border border-bolttech-border dark:border-bolttech-dark-border hover:border-bolttech-primary'
              }`}
            >
              ☁️ Azure DevOps Cloud
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setServerType('tfs')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex-1 px-4 py-3 rounded-bolttech font-semibold transition-all duration-250 ${
                serverType === 'tfs'
                  ? 'bg-gradient-to-r from-bolttech-primary to-bolttech-accent text-white shadow-bolttech-hover'
                  : 'bg-bolttech-bg dark:bg-bolttech-dark-surface text-bolttech-text dark:text-white border border-bolttech-border dark:border-bolttech-dark-border hover:border-bolttech-primary'
              }`}
            >
              🖥️ TFS On-Premises
            </motion.button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Server URL */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <label className="block text-sm font-semibold text-bolttech-text dark:text-white mb-2">
              {serverType === 'cloud' ? 'Organization URL' : 'TFS Server URL'}
            </label>
            <input
              type="url"
              value={orgUrl}
              onChange={(e) => setOrgUrl(e.target.value)}
              placeholder={
                serverType === 'cloud'
                  ? 'https://dev.azure.com/yourorg'
                  : 'https://tlvtfs03.ciosus.com/tfs'
              }
              required
              className={BolttechStyles.inputs.base}
            />
            <p className="text-xs text-bolttech-text-lighter dark:text-bolttech-text-lighter mt-2">
              {serverType === 'cloud'
                ? 'Format: https://dev.azure.com/yourorgname'
                : 'Format: https://server.com/tfs (without collection name)'}
            </p>
          </motion.div>

          {/* Collection Name (TFS only) */}
          {serverType === 'tfs' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-bolttech-primary/5 dark:bg-bolttech-primary/10 border border-bolttech-primary/30 rounded-bolttech"
            >
              <label className="block text-sm font-bold text-bolttech-primary dark:text-bolttech-accent mb-2">
                📌 Collection Name (Required for TFS)
              </label>
              <input
                type="text"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="BoltCollection"
                required
                className={BolttechStyles.inputs.base}
              />
              <p className="text-xs text-bolttech-text-light dark:text-bolttech-text-lighter mt-2">
                The TFS collection name where your project lives (e.g., <code className="bg-bolttech-bg/50 px-1 rounded">BoltCollection</code>)
              </p>
            </motion.div>
          )}

          {/* Project Name */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <label className="block text-sm font-semibold text-bolttech-text dark:text-white mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={
                serverType === 'cloud' ? 'My Project' : 'MyProjectName'
              }
              required
              className={BolttechStyles.inputs.base}
            />
          </motion.div>

          {/* PAT Token */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <label className="block text-sm font-semibold text-bolttech-text dark:text-white mb-2">
              Personal Access Token (PAT)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                placeholder="Your PAT token"
                required
                className={BolttechStyles.inputs.base}
              />
              <motion.button
                type="button"
                onClick={() => setShowToken(!showToken)}
                whileHover={{ scale: 1.05 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-bolttech-text-light hover:text-bolttech-primary dark:hover:text-bolttech-accent transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </motion.button>
            </div>
            <p className="text-xs text-bolttech-text-lighter dark:text-bolttech-text-lighter mt-2">
              ✔️ Must have <strong>Work Items (read, write)</strong> and <strong>Test Management (read, write)</strong> scopes
            </p>
          </motion.div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-start gap-3 p-4 bg-bolttech-error/10 dark:bg-bolttech-error/20 border border-bolttech-error/50 rounded-bolttech"
            >
              <AlertCircle className="w-5 h-5 text-bolttech-error flex-shrink-0 mt-0.5" />
              <p className="text-sm text-bolttech-error">{error}</p>
            </motion.div>
          )}

          {/* Form Validation Feedback */}
          {!isFormValid && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-start gap-3 p-4 bg-bolttech-warning/10 dark:bg-bolttech-warning/20 border border-bolttech-warning/50 rounded-bolttech"
            >
              <AlertCircle className="w-5 h-5 text-bolttech-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm text-bolttech-text dark:text-bolttech-text-lighter">
                <p className="font-semibold mb-2">Please fill in all required fields:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {!orgUrl && <li>{serverType === 'cloud' ? 'Organization URL' : 'TFS Server URL'}</li>}
                  {!projectName && <li>Project Name</li>}
                  {!patToken && <li>Personal Access Token</li>}
                  {serverType === 'tfs' && !collectionName && <li>Collection Name (required for TFS)</li>}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Submit Button */}
          <motion.button
            type="submit"
            disabled={isLoading || !isFormValid}
            whileHover={{ scale: isLoading || !isFormValid ? 1 : 1.02 }}
            whileTap={{ scale: isLoading || !isFormValid ? 1 : 0.98 }}
            className={`w-full px-4 py-3 mt-6 rounded-bolttech font-semibold transition-all duration-250 flex items-center justify-center gap-2 ${
              isLoading || !isFormValid
                ? 'bg-bolttech-border dark:bg-bolttech-dark-border cursor-not-allowed text-bolttech-text-light'
                : 'bg-gradient-to-r from-bolttech-primary to-bolttech-accent text-white shadow-bolttech-card hover:shadow-bolttech-hover'
            }`}
          >
            {isLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
                Connecting...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Connect to{' '}
                {serverType === 'cloud' ? 'Azure DevOps' : 'TFS Server'}
              </>
            )}
          </motion.button>

          {/* Test Connection Button */}
          <motion.button
            type="button"
            onClick={handleTestConnection}
            disabled={!isFormValid || isTesting}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full px-4 py-2 bg-bolttech-bg dark:bg-bolttech-dark-surface hover:bg-bolttech-border dark:hover:bg-bolttech-dark-border border border-bolttech-border dark:border-bolttech-dark-border text-bolttech-text dark:text-white rounded-bolttech font-semibold transition-all duration-250 flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-bolttech-primary border-t-transparent rounded-full"
                />
                Testing...
              </>
            ) : (
              '🔍 Test Connection'
            )}
          </motion.button>

          {/* Test Result */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 bg-bolttech-bg dark:bg-bolttech-dark-surface border border-bolttech-border dark:border-bolttech-dark-border rounded-bolttech"
            >
              <pre className="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto text-bolttech-text-light dark:text-bolttech-text-lighter">
                {testResult}
              </pre>
            </motion.div>
          )}
        </form>

        {/* Help Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-8 p-5 bg-bolttech-info/5 dark:bg-bolttech-info/10 rounded-bolttech border border-bolttech-info/20"
        >
          <p className="text-sm font-semibold text-bolttech-text dark:text-white mb-3 flex items-center gap-2">
            📋 Need Help?
          </p>
          {serverType === 'cloud' ? (
            <ol className="text-sm text-bolttech-text-light dark:text-bolttech-text-lighter space-y-2 list-decimal list-inside">
              <li>
                Go to{' '}
                <a
                  href="https://dev.azure.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bolttech-primary hover:text-bolttech-primary-light underline font-semibold"
                >
                  dev.azure.com
                </a>
              </li>
              <li>Click your profile icon → Personal access tokens</li>
              <li>Create new token with <strong>Test</strong> &amp; <strong>Work Items</strong> scopes</li>
              <li>Set expiration and paste token above</li>
            </ol>
          ) : (
            <ol className="text-sm text-bolttech-text-light dark:text-bolttech-text-lighter space-y-2 list-decimal list-inside">
              <li>Open your TFS server URL in browser</li>
              <li>Click your profile icon → Personal access tokens</li>
              <li>Create new token with <strong>Test</strong> &amp; <strong>Work Items</strong> scopes</li>
              <li>Set expiration and paste token above</li>
            </ol>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};
