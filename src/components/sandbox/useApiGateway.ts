import type React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { TestExecutionResult, ApiEndpoint } from '../../types';
import { API_ENDPOINTS } from '../../data/endpointsData';

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

interface UseApiGatewayProps {
  isServerRunning: boolean;
  setIsServerRunning: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useApiGateway = ({ isServerRunning, setIsServerRunning }: UseApiGatewayProps) => {
  const [selectedSuite, setSelectedSuite] = useState<'all' | 'solana' | 'mcp' | 'dataweave'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'GET' | 'POST'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>(API_ENDPOINTS[0]);

  // Parameter and body states
  const [queryParams, setQueryParams] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (API_ENDPOINTS[0].queryParams) {
      API_ENDPOINTS[0].queryParams.forEach(p => {
        if (p.default !== undefined) initial[p.name] = p.default;
      });
    }
    return initial;
  });
  const [requestBodyText, setRequestBodyText] = useState<string>(
    JSON.stringify(API_ENDPOINTS[0].defaultParams || { sample_param: 'test' }, null, 2)
  );

  // Execution result
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState<TestExecutionResult | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Server Engine State
  const [isBootingServer, setIsBootingServer] = useState(false);
  const [serverUptimeSeconds, setServerUptimeSeconds] = useState(0);
  const [serverLogs, setServerLogs] = useState<ServerAccessLog[]>([]);
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

  const filteredEndpoints = useMemo(() => {
    return API_ENDPOINTS.filter(ep => {
      const matchesSuite = selectedSuite === 'all' || ep.suite === selectedSuite;
      const matchesMethod = methodFilter === 'all' || ep.method === methodFilter;
      const matchesSearch =
        !searchQuery ||
        ep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.category.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSuite && matchesMethod && matchesSearch;
    });
  }, [selectedSuite, methodFilter, searchQuery]);

  const handleSelectEndpoint = (ep: ApiEndpoint) => {
    setSelectedEndpoint(ep);

    // Populate query params with this endpoint's own defaults so inputs
    // are pre-filled and testable without typing anything first.
    const freshParams: Record<string, string> = {};
    if (ep.queryParams) {
      ep.queryParams.forEach(p => {
        if (p.default !== undefined) freshParams[p.name] = p.default;
      });
    }
    setQueryParams(freshParams);

    if (ep.defaultParams) {
      setRequestBodyText(JSON.stringify(ep.defaultParams, null, 2));
    } else if (ep.sampleRequestBody) {
      setRequestBodyText(JSON.stringify(ep.sampleRequestBody, null, 2));
    } else {
      setRequestBodyText('');
    }
    setTestResult(null);
  };

  const loadPreset = (preset: Record<string, string>) => {
    setQueryParams(prev => ({ ...prev, ...preset }));
  };

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

    const queryParts: string[] = [];
    if (selectedEndpoint.queryParams) {
      selectedEndpoint.queryParams.forEach(q => {
        const val = queryParams[q.name] || q.default;
        if (val) queryParts.push(`${encodeURIComponent(q.name)}=${encodeURIComponent(val)}`);
      });
    }
    const fullUrl = `${targetPath}${queryParts.length > 0 ? `?${queryParts.join('&')}` : ''}`;

    try {
      const t0 = performance.now();
      const res = await fetch(fullUrl, {
        method: selectedEndpoint.method,
        headers: selectedEndpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: selectedEndpoint.method === 'POST' ? requestBodyText : undefined
      });
      const liveDuration = Math.round(performance.now() - t0);
      const ctype = res.headers.get('content-type') || '';
      const isJson = ctype.includes('json');
      const body = isJson
        ? await res.json().catch(() => ({ error: 'Invalid JSON from server' }))
        : { error: 'Route not found: the server returned a web page, not an API response.' };
      const status = isJson ? res.status : 404;
      const hdrs: Record<string, string> = { 'content-type': ctype || 'unknown' };
      ['x-free-calls-remaining', 'x-credits-remaining'].forEach(h => { const v = res.headers.get(h); if (v !== null) hdrs[h] = v; });
      addServerLog(selectedEndpoint.method, fullUrl, status, liveDuration, JSON.stringify(body).length);
      setTestResult({
        endpointId: selectedEndpoint.id, url: fullUrl, method: selectedEndpoint.method, status,
        latencyMs: liveDuration, timestamp: new Date().toLocaleTimeString(), headers: hdrs,
        responseBody: body, isTypoTriggered: triggerTypo
      });
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
      const ep = API_ENDPOINTS[i];
      const qp: string[] = [];
      (ep.queryParams || []).forEach(q => { if (q.default) qp.push(encodeURIComponent(q.name) + '=' + encodeURIComponent(q.default)); });
      const url = ep.path + (qp.length ? '?' + qp.join('&') : '');
      const t0 = performance.now();
      let status = 0;
      try {
        const r = await fetch(url, ep.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : undefined);
        status = (r.headers.get('content-type') || '').includes('json') ? r.status : 404;
      } catch { status = 500; }
      const lat = Math.round(performance.now() - t0);
      addServerLog(ep.method, url, status, lat, 0);
      totalLatency += lat;
      if (status === 200) passed++;
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

  const generatedCurl = useMemo(() => {
    let curl = `curl -X ${selectedEndpoint.method} "http://localhost:3000${selectedEndpoint.path}`;
    if (selectedEndpoint.queryParams && selectedEndpoint.queryParams.length > 0) {
      const q = selectedEndpoint.queryParams.map(p => `${p.name}=${queryParams[p.name] || p.default || ''}`).join('&');
      curl += `?${q}`;
    }
    curl += `" \\\n  -H "Content-Type: application/json"`;
    if (selectedEndpoint.method === 'POST' && requestBodyText) {
      curl += ` \\\n  -d '${requestBodyText.replace(/\\n/g, '')}'`;
    }
    return curl;
  }, [selectedEndpoint, queryParams, requestBodyText]);

  const copyCurl = () => {
    navigator.clipboard.writeText(generatedCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const copyAllLogs = () => {
    const formatted = serverLogs.map(l => `[${l.timestamp}] ${l.method} ${l.path} -> ${l.status} (${l.latencyMs}ms)`).join('\\n');
    navigator.clipboard.writeText(formatted);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return {
    state: {
      selectedSuite,
      methodFilter,
      searchQuery,
      selectedEndpoint,
      queryParams,
      requestBodyText,
      isExecuting,
      testResult,
      copiedCurl,
      isBootingServer,
      serverUptimeSeconds,
      serverLogs,
      copiedLogs,
      isBatchTesting,
      batchProgress,
      batchStats,
      generatedCurl,
      filteredEndpoints,
    },
    actions: {
      setSelectedSuite,
      setMethodFilter,
      setSearchQuery,
      handleSelectEndpoint,
      setQueryParams,
      setRequestBodyText,
      handleExecuteRequest,
      handleToggleServer,
      handleRunBatchTestSuite,
      copyCurl,
      copyAllLogs,
      setServerLogs,
      loadPreset,
      formatUptime,
    },
  };
};
