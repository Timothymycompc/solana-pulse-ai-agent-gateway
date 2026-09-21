import React from 'react';
import { Activity, Play, Copy, Check, Clock, AlertTriangle } from 'lucide-react';
import { ApiEndpoint, TestExecutionResult } from '../../types';

interface ExecutionPaneProps {
  selectedEndpoint: ApiEndpoint;
  queryParams: Record<string, string>;
  setQueryParams: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  requestBodyText: string;
  setRequestBodyText: React.Dispatch<React.SetStateAction<string>>;
  isExecuting: boolean;
  testResult: TestExecutionResult | null;
  copiedCurl: boolean;
  generatedCurl: string;
  handleExecuteRequest: (triggerTypo?: boolean) => Promise<void>;
  copyCurl: () => void;
  loadPreset: (preset: Record<string, string>) => void;
}

export const ExecutionPane: React.FC<ExecutionPaneProps> = ({
  selectedEndpoint,
  queryParams,
  setQueryParams,
  requestBodyText,
  setRequestBodyText,
  isExecuting,
  testResult,
  copiedCurl,
  generatedCurl,
  handleExecuteRequest,
  copyCurl,
  loadPreset,
}) => {
  return (
    <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-[740px] overflow-y-auto space-y-6">
      {/* Endpoint Header */}
      <div className="space-y-2 pb-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                selectedEndpoint.method === 'GET'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              }`}
            >
              {selectedEndpoint.method}
            </span>
            <h3 className="text-base font-bold text-white">{selectedEndpoint.name}</h3>
          </div>
          <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
            {selectedEndpoint.category}
          </span>
        </div>
        <p className="text-xs text-slate-300 font-mono bg-slate-950 p-2 rounded-xl border border-slate-800">
          {selectedEndpoint.path}
        </p>
        <p className="text-xs text-slate-400">{selectedEndpoint.description}</p>
      </div>

      {/* Parameters & Request Body Input */}
      <div className="space-y-4">
        {selectedEndpoint.queryParams && selectedEndpoint.queryParams.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Query Parameters
              </h4>
              <span className="text-[10px] text-slate-500 italic">Required: marked with *</span>
            </div>
            {selectedEndpoint.presets && selectedEndpoint.presets.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedEndpoint.presets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadPreset(preset.params)}
                    className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-[10px] font-medium text-indigo-300 transition"
                  >
                    ⚡ {preset.label}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2">
              {selectedEndpoint.queryParams.map((param) => (
                <div key={param.name} className="flex items-center gap-3 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <div className="w-28">
                    <span className="text-xs font-mono font-semibold text-slate-200">{param.name}</span>
                    {param.required && <span className="text-rose-400 text-[10px] ml-1">*</span>}
                    <p className="text-[10px] text-slate-500">{param.type}</p>
                  </div>
                  <input
                    type="text"
                    value={queryParams[param.name] ?? param.default ?? ''}
                    onChange={(e) => setQueryParams({ ...queryParams, [param.name]: e.target.value })}
                    placeholder={param.description}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedEndpoint.method === 'POST' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                JSON Request Body
              </h4>
              <button
                onClick={() => setRequestBodyText(JSON.stringify(selectedEndpoint.sampleRequestBody || {}, null, 2))}
                className="text-[11px] text-indigo-400 hover:underline"
              >
                Reset to Sample Body
              </button>
            </div>
            {selectedEndpoint.requestBodySchema && (
              <div className="p-2 bg-slate-950/50 border border-slate-800 rounded-xl mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Expected Schema</p>
                <pre className="text-[10px] font-mono text-slate-400">
                  {JSON.stringify(selectedEndpoint.requestBodySchema, null, 2)}
                </pre>
              </div>
            )}
            <textarea
              rows={4}
              value={requestBodyText}
              onChange={(e) => setRequestBodyText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Sample Response Preview - shown before executing so users know the shape */}
      {selectedEndpoint.sampleResponse && !testResult && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Example Response Structure
          </h4>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-64 font-mono text-xs text-slate-400">
            <pre>{JSON.stringify(selectedEndpoint.sampleResponse, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          onClick={() => handleExecuteRequest(false)}
          disabled={isExecuting}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition"
        >
          {isExecuting ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Execute Live Request
        </button>

        {selectedEndpoint.typoPath && (
          <button
            onClick={() => handleExecuteRequest(true)}
            disabled={isExecuting}
            className="px-3.5 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition"
            title="Simulates testing with a typo URL like /v1/solans/... to reproduce the 404 error"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            Test Typo Path ({selectedEndpoint.typoPath.slice(0, 16)}...)
          </button>
        )}

        <button
          onClick={copyCurl}
          className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition ml-auto border border-slate-700"
        >
          {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedCurl ? 'Copied cURL!' : 'Copy cURL'}
        </button>
      </div>

      {/* Response Output Box */}
      {testResult && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                  testResult.status === 200
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                HTTP {testResult.status} {testResult.status === 200 ? 'OK' : testResult.status === 503 ? 'SERVER OFFLINE' : 'NOT FOUND'}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {testResult.latencyMs}ms
              </span>
            </div>
            <span className="text-[11px] text-slate-500">{testResult.timestamp}</span>
          </div>

          {testResult.isTypoTriggered && (
            <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-xl text-xs text-amber-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Simulated 404 Diagnostics:
              </p>
              <p className="text-[11px] text-amber-200/90">
                This demonstrates the exact 404 error returned in your Termux test script. Notice how requesting <code className="bg-amber-900/60 px-1 py-0.5 rounded">/v1/solans/...</code> fails because the router is registered on <code className="bg-amber-900/60 px-1 py-0.5 rounded">/v1/solana/...</code>.
              </p>
            </div>
          )}

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-64 font-mono text-xs text-slate-200">
            <pre>{JSON.stringify(testResult.responseBody, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
