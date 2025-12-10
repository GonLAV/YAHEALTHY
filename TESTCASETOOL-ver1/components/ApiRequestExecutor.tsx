'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Copy,
  Download,
  RotateCcw,
  Code,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import axios from 'axios';

interface ApiExecutorProps {
  baseUrl?: string;
  patToken?: string;
}

export const ApiRequestExecutor: React.FC<ApiExecutorProps> = ({
  baseUrl,
  patToken,
}) => {
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>(
    'GET'
  );
  const [endpoint, setEndpoint] = useState('');
  const [headers, setHeaders] = useState('{}');
  const [body, setBody] = useState('{}');
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  const handleExecute = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setResponse(null);

      const startTime = Date.now();

      let headersObj: Record<string, string> = {};
      try {
        headersObj = JSON.parse(headers);
      } catch (e) {
        throw new Error('Invalid headers JSON');
      }

      // Add auth if PAT token is provided
      if (patToken) {
        const encodedToken = Buffer.from(`:${patToken}`).toString('base64');
        headersObj['Authorization'] = `Basic ${encodedToken}`;
      }

      let bodyData = undefined;
      if (method !== 'GET' && method !== 'DELETE' && body) {
        try {
          bodyData = JSON.parse(body);
        } catch (e) {
          throw new Error('Invalid body JSON');
        }
      }

      const url = baseUrl
        ? `${baseUrl}${endpoint}`
        : endpoint;

      const config: any = {
        method,
        url,
        headers: headersObj,
        validateStatus: () => true, // Don't throw on any status
      };

      if (bodyData) {
        config.data = bodyData;
      }

      const result = await axios(config);
      const endTime = Date.now();

      setResponseTime(endTime - startTime);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
    }
  };

  const handleDownloadResponse = () => {
    if (response) {
      const element = document.createElement('a');
      element.setAttribute(
        'href',
        'data:application/json;charset=utf-8,' +
          encodeURIComponent(JSON.stringify(response.data, null, 2))
      );
      element.setAttribute('download', 'api_response.json');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          API Request Executor
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Postman-style API testing for Azure DevOps
        </p>
      </div>

      {/* Request Builder */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Method & Endpoint */}
        <div className="flex gap-3">
          <select
            value={method}
            onChange={(e) =>
              setMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')
            }
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>

          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="/test/plans?api-version=7.0"
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={handleExecute}
            disabled={isLoading || !endpoint}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Send
          </button>
        </div>

        {/* Headers */}
        <div>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
            Headers (JSON)
          </label>
          <textarea
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder='{"Content-Type": "application/json"}'
            className="w-full h-20 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Body */}
        {method !== 'GET' && method !== 'DELETE' && (
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
              Body (JSON)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="{}"
              className="w-full h-32 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Response */}
      {response && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-slate-200 dark:border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {response.status >= 200 && response.status < 300 ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span className="font-semibold">
                Status: {response.status} {response.statusText}
                {responseTime && (
                  <span className="text-slate-500 dark:text-slate-400 text-sm ml-2">
                    ({responseTime}ms)
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyResponse}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={handleDownloadResponse}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <pre className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg overflow-auto max-h-40 text-xs font-mono text-slate-900 dark:text-slate-100">
            {JSON.stringify(response.data, null, 2)}
          </pre>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-slate-200 dark:border-slate-700 p-6 bg-red-50 dark:bg-red-900/10"
        >
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">{error}</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
