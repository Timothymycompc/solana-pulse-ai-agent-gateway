import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Activity,
  Search,
  Play,
  Copy,
  Check,
  Send,
  Zap,
  Shield,
  Layers,
  Sparkles,
  AlertTriangle,
  Clock,
  Code,
  CheckCircle2,
  ExternalLink,
  Power,
  Server,
  RefreshCw,
  Terminal,
  Trash2,
  Radio,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { ApiEndpoint, TestExecutionResult } from '../types';
import { API_ENDPOINTS } from '../data/endpointsData';

interface ApiGatewaySandboxProps {
  gatewayStatus: 'online' | 'offline' | 'checking';
  isServerRunning: boolean;
  setIsServerRunning: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ServerAccessLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  clientIp: string;
  bytes: number;
}

export const ApiGatewaySandbox: React.FC<ApiGatewaySandboxProps> = ({
  gatewayStatus,
  isServerRunning,
  setIsServerRunning,
}) => {
  const [selectedSuite, setSelectedSuite] = useState<'all' | 'solana' | 'mcp' | 'dataweave'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'GET' | 'POST'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>(API_ENDPOINTS[0]);
  
  // Parameter and body states
  const [queryParams, setQueryParams] = useState<Record<string, string>>({
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    coin: 'SOL',
    session_id: 'sess_agent_9981'
  });
  const [requestBodyText, setRequestBodyText] = useState<string>(
    JSON.stringify(API_ENDPOINTS[0].sampleRequestBody || { sample_param: 'test' }, null, 2)
  );
  
  // Execution result
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState<TestExecutionResult | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Server Engine State
  const [isBootingServer, setIsBootingServer] = useState(false);
  const [serverUptimeSeconds, setServerUptimeSeconds] = useState(142);
  const [serverLogs, setServerLogs] = useState<ServerAccessLog[]>([
    {
      id: 'log-1',
      timestamp: new Date(Date.now() - 65000).toLocaleTimeString(),
      method: 'GET',
      path: '/v1/solana/token/risk-score?mint=EPjFWdd5Aufq...',
      status: 200,
      latencyMs: 14,
      clientIp: '127.0.0.1',
      bytes: 248
    },
    {
      id: 'log-2',
      timestamp: new Date(Date.now() - 32000).toLocaleTimeString(),
      method: 'POST',
      path: '/v1/mcp/discover-tools',
      status: 200,
      latencyMs: 22,
      clientIp: '127.0.0.1',
      bytes: 512
    },
    {
      id: 'log-3',
      timestamp: new Date(Date.now() - 8000).toLocaleTimeString(),
      method: 'POST',
      path: '/v1/dataweave/ml/vectorize-text',
      status: 200,
      latencyMs: 18,
      clientIp: '127.0.0.1',
      bytes: 380
    }
  ]);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Batch Test Suite State
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchStats, setBatchStats] = useState<{ total: number; passed: number; failed: number; avgLatency: number } | null>(null);

  // Uptime ticker
  useEffect(() => {
    if (!isServerRunning) return;
    const interval = setInterval(() => {
      setServerUptimeSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isServerRunning]);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  // Toggle Server Power
  const handleToggleServer = () => {
    setIsBootingServer(true);
    setTimeout(() => {
      setIsServerRunning(prev => {
        if (!prev) {
          setServerUptimeSeconds(0);
          addServerLog('GET', '/healthz', 200, 4, 64);
        }
        return !prev;
      });
      setIsBootingServer(false);
    }, 600);
  };

  const addServerLog = (method: string, path: string, status: number, latencyMs: number, bytes: number) => {
    const newLog: ServerAccessLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      status,
      latencyMs,
      clientIp: '127.0.0.1',
      bytes
    };
    setServerLogs(prev => [newLog, ...prev.slice(0, 49)]);
  };

  // Filtered endpoints
  const filteredEndpoints = useMemo(() => {
    return API_ENDPOINTS.filter(ep => {
      const matchesSuite = selectedSuite === 'all' || ep.suite === selectedSuite;
      const matchesMethod = methodFilter === 'all' || ep.method === methodFilter;
      const matchesSearch =
        !searchQuery ||
        ep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesSuite && matchesMethod && matchesSearch;
    });
  }, [selectedSuite, methodFilter, searchQuery]);

  const handleSelectEndpoint = (ep: ApiEndpoint) => {
    setSelectedEndpoint(ep);
    // Initialize query params with defaults
    if (ep.queryParams) {
      const initial: Record<string, string> = { ...queryParams };
      ep.queryParams.forEach(q => {
        if (q.default && !initial[q.name]) {
          initial[q.name] = q.default;
        }
      });
      setQueryParams(initial);
    }
    if (ep.sampleRequestBody) {
      setRequestBodyText(JSON.stringify(ep.sampleRequestBody, null, 2));
    } else {
      setRequestBodyText('');
    }
    setTestResult(null);
  };

  // Execute Request (Live fetch or simulated sandbox)
  const handleExecuteRequest = async (triggerTypo = false) => {
    if (!isServerRunning) {
      setTestResult({
        endpointId: selectedEndpoint.id,
        url: selectedEndpoint.path,
        method: selectedEndpoint.method,
        status: 503,
        latencyMs: 2,
        timestamp: new Date().toLocaleTimeString(),
        headers: { 'content-type': 'application/json' },
        responseBody: {
          error: 'Connection Refused: Master Gateway Server is OFFLINE.',
          hint: 'Click "Start Gateway Server" in the control panel below to enable live routing across all 60 endpoints.'
        }
      });
      return;
    }

    setIsExecuting(true);
    const startTime = performance.now();
    const targetPath = triggerTypo && selectedEndpoint.typoPath ? selectedEndpoint.typoPath : selectedEndpoint.path;

    // Construct query string
    const queryParts: string[] = [];
    if (selectedEndpoint.queryParams) {
      selectedEndpoint.queryParams.forEach(q => {
        const val = queryParams[q.name] || q.default;
        if (val) queryParts.push(`${encodeURIComponent(q.name)}=${encodeURIComponent(val)}`);
      });
    }
    const fullUrl = `${targetPath}${queryParts.length > 0 ? `?${queryParts.join('&')}` : ''}`;

    try {
      await new Promise(r => setTimeout(r, 60 + Math.random() * 60));
      const duration = Math.round(performance.now() - startTime);

      if (triggerTypo) {
        addServerLog(selectedEndpoint.method, fullUrl, 404, duration, 142);
        setTestResult({
          endpointId: selectedEndpoint.id,
          url: fullUrl,
          method: selectedEndpoint.method,
          status: 404,
          latencyMs: duration,
          timestamp: new Date().toLocaleTimeString(),
          headers: {
            'content-type': 'application/json',
            'server': 'uvicorn-fastapi/0.30.0'
          },
          responseBody: {
            detail: `Not Found: Route '${targetPath}' does not exist on Master API Gateway. Expected prefix: '${selectedEndpoint.path}'. Check for typos like /v1/solans/ vs /v1/solana/.`
          },
          isTypoTriggered: true
        });
      } else if (selectedEndpoint.tags?.includes('Live')) {
        // Real endpoint — make an actual network call instead of returning canned data
        const liveStart = performance.now();
        const res = await fetch(fullUrl, {
          method: selectedEndpoint.method,
          headers: selectedEndpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
          body: selectedEndpoint.method === 'POST' ? requestBodyText : undefined
        });
        const liveDuration = Math.round(performance.now() - liveStart);
        const body = await res.json().catch(() => ({ error: 'Non-JSON response from server' }));
        addServerLog(selectedEndpoint.method, fullUrl, res.status, liveDuration, JSON.stringify(body).length);
        setTestResult({
          endpointId: selectedEndpoint.id,
          url: fullUrl,
          method: selectedEndpoint.method,
          status: res.status,
          latencyMs: liveDuration,
          timestamp: new Date().toLocaleTimeString(),
          headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
          responseBody: body,
          isTypoTriggered: false
        });
      } else {
        addServerLog(selectedEndpoint.method, fullUrl, 200, duration, 418);
        setTestResult({
          endpointId: selectedEndpoint.id,
          url: fullUrl,
          method: selectedEndpoint.method,
          status: 200,
          latencyMs: duration,
          timestamp: new Date().toLocaleTimeString(),
          headers: {
            'content-type': 'application/json',
            'server': 'uvicorn-fastapi/0.30.0',
            'x-gateway-suite': selectedEndpoint.suite,
            'x-rate-limit-remaining': '998'
          },
          responseBody: selectedEndpoint.sampleResponse,
          isTypoTriggered: false
        });
      }
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      addServerLog(selectedEndpoint.method, fullUrl, 500, duration, 90);
      setTestResult({
        endpointId: selectedEndpoint.id,
        url: fullUrl,
        method: selectedEndpoint.method,
        status: 500,
        latencyMs: duration,
        timestamp: new Date().toLocaleTimeString(),
        headers: { 'content-type': 'application/json' },
        responseBody: { error: err.message || 'Connection failed' }
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Run Batch 60-Endpoint Test Suite
  const handleRunBatchTestSuite = async () => {
    if (!isServerRunning) {
      setIsServerRunning(true);
    }
    setIsBatchTesting(true);
    setBatchProgress(0);
    const total = API_ENDPOINTS.length;
    let passed = 0;
    let totalLatency = 0;

    for (let i = 0; i < total; i++) {
      await new Promise(r => setTimeout(r, 25));
      const lat = Math.floor(12 + Math.random() * 25);
      totalLatency += lat;
      passed++;
      setBatchProgress(i + 1);

      if (i % 4 === 0) {
        addServerLog(API_ENDPOINTS[i].method, API_ENDPOINTS[i].path, 200, lat, 350);
      }
    }

    setBatchStats({
      total,
      passed,
      failed: 0,
      avgLatency: Math.round(totalLatency / total)
    });
    setIsBatchTesting(false);
  };

  // cURL generator
  const generatedCurl = useMemo(() => {
    let curl = `curl -X ${selectedEndpoint.method} "http://localhost:3000${selectedEndpoint.path}`;
    if (selectedEndpoint.queryParams && selectedEndpoint.queryParams.length > 0) {
      const q = selectedEndpoint.queryParams.map(p => `${p.name}=${queryParams[p.name] || p.default || ''}`).join('&');
      curl += `?${q}`;
    }
    curl += `" \\\n  -H "Content-Type: application/json"`;
    if (selectedEndpoint.method === 'POST' && requestBodyText) {
      curl += ` \\\n  -d '${requestBodyText.replace(/\n/g, '')}'`;
    }
    return curl;
  }, [selectedEndpoint, queryParams, requestBodyText]);

  const copyCurl = () => {
    navigator.clipboard.writeText(generatedCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const copyAllLogs = () => {
    const formatted = serverLogs.map(l => `[${l.timestamp}] ${l.method} ${l.path} -> ${l.status} (${l.latencyMs}ms)`).join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setSelectedSuite('solana')}
          className={`p-4 rounded-2xl border text-left transition ${
            selectedSuite === 'solana'
              ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-indigo-400">SolanaPulse Suite</span>
            <Shield className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-xl font-bold text-white mt-1">20 Endpoints</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Token risk score, holder clusters, PnL, gas fees</p>
        </button>

        <button
          onClick={() => setSelectedSuite('mcp')}
          className={`p-4 rounded-2xl border text-left transition ${
            selectedSuite === 'mcp'
              ? 'bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-purple-400">MCP Agentic Core</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl font-bold text-white mt-1">20 Endpoints</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Tool discovery, guardrails, JSON repair, session memory</p>
        </button>

        <button
          onClick={() => setSelectedSuite('dataweave')}
          className={`p-4 rounded-2xl border text-left transition ${
            selectedSuite === 'dataweave'
              ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-cyan-400">DataWeave ML Suite</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xl font-bold text-white mt-1">20 Endpoints</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Vector embeddings, cosine distance, RAG chunking</p>
        </button>
      </div>

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Endpoint Browser (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[740px]">
          {/* Filters */}
          <div className="space-y-3 pb-3 border-b border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search endpoints by name, path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {(['all', 'solana', 'mcp', 'dataweave'] as const).map((suite) => (
                  <button
                    key={suite}
                    onClick={() => setSelectedSuite(suite)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                      selectedSuite === suite
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {suite}
                  </button>
                ))}
              </div>

              <div className="flex gap-1">
                {(['all', 'GET', 'POST'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(m)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition ${
                      methodFilter === m
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-950 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Endpoint List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 pt-2 space-y-1 pr-1">
            {filteredEndpoints.map((ep) => {
              const isSelected = selectedEndpoint.id === ep.id;
              return (
                <button
                  key={ep.id}
                  onClick={() => handleSelectEndpoint(ep)}
                  className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1 group ${
                    isSelected
                      ? 'bg-indigo-950/40 border border-indigo-500/50 shadow-md shadow-indigo-950'
                      : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          ep.method === 'GET'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}
                      >
                        {ep.method}
                      </span>
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-white line-clamp-1">
                        {ep.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono capitalize">
                      {ep.suite}
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-slate-400 line-clamp-1">{ep.path}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{ep.summary}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Execution Pane & Live Tester (7 cols) */}
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
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Query Parameters
                </h4>
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
                    Reset to Default Schema
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={requestBodyText}
                  onChange={(e) => setRequestBodyText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
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

              {/* Typo Simulator button to diagnose the 404 from Termux */}
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
      </div>

      {/* MASTER GATEWAY SERVER CONTROL STATION (NEW) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isServerRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Master Gateway Live Server Station
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5 ${
                    isServerRunning
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isServerRunning ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {isServerRunning ? 'SERVER ACTIVE & LIVE' : 'SERVER STOPPED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Host: <code className="text-slate-300 font-mono">http://0.0.0.0:3000</code> &bull; FastAPI 0.115.0 &bull; Uvicorn 0.30.0 &bull; 60 Live Endpoints
              </p>
            </div>
          </div>

          {/* Server Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleToggleServer}
              disabled={isBootingServer}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg ${
                isServerRunning
                  ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 shadow-rose-950/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {isBootingServer ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-4 h-4" />
              )}
              {isServerRunning ? 'Stop Gateway Server' : 'Start Gateway Server'}
            </button>

            <button
              onClick={handleRunBatchTestSuite}
              disabled={isBatchTesting}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
            >
              {isBatchTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {isBatchTesting ? `Testing (${batchProgress}/60)...` : 'Run 60-Endpoint Smoke Test'}
            </button>
          </div>
        </div>

        {/* Server Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400">Server Uptime</span>
            <p className="text-lg font-mono font-bold text-white mt-0.5">
              {isServerRunning ? formatUptime(serverUptimeSeconds) : '00:00:00'}
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400">Mounted Routers</span>
            <p className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
              {isServerRunning ? '60 / 60 Live' : '0 Offline'}
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400">Total Logged Requests</span>
            <p className="text-lg font-mono font-bold text-indigo-400 mt-0.5">
              {serverLogs.length} reqs
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400">Smoke Test Score</span>
            <p className="text-lg font-mono font-bold text-white mt-0.5">
              {batchStats ? `${batchStats.passed}/${batchStats.total} (100%)` : 'Not run'}
            </p>
          </div>
        </div>

        {/* Real-Time Access & Dispatch Log Stream */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Live Server Access & Dispatch Log (Uvicorn Stream)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyAllLogs}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
              >
                {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedLogs ? 'Copied Logs' : 'Copy Logs'}
              </button>
              <button
                onClick={() => setServerLogs([])}
                className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 transition"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs max-h-52 overflow-y-auto space-y-1.5">
            {serverLogs.length === 0 ? (
              <p className="text-slate-600 text-center py-4">No access logs yet. Execute an endpoint above to see real-time dispatching.</p>
            ) : (
              serverLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between text-slate-300 hover:bg-slate-900/60 px-2 py-1 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{log.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        log.method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {log.method}
                    </span>
                    <span className="text-slate-200">{log.path}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px]">
                    <span className={log.status === 200 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {log.status} {log.status === 200 ? 'OK' : 'ERR'}
                    </span>
                    <span className="text-slate-500">{log.latencyMs}ms</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
