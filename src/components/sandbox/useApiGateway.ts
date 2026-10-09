import { useEffect, useMemo, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { TestExecutionResult, ApiEndpoint } from '../../types';
import { API_ENDPOINTS } from '../../data/endpointsData';

interface ServerAccessLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

const initialEndpoint = API_ENDPOINTS.find((endpoint) => endpoint.id === 'solana-balance') ?? API_ENDPOINTS[0];
const methods: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const meteredRoutes = new Set([
  '/api/solana/balance',
  '/api/solana/blockhash',
  '/api/solana/token-accounts',
  '/api/solana/transactions',
  '/api/solana/find-ata',
  '/api/solana/simulate',
  '/api/solana/validate-and-simulate',
  '/api/solana/token-profile',
  '/api/solana/optimal-fee',
  '/api/solana/decode-tx',
]);

function isMeteredToolCall(path: string, body: string): boolean {
  try {
    const url = new URL(path, window.location.origin);
    if (meteredRoutes.has(url.pathname)) return true;
    return url.pathname === '/mcp' && JSON.parse(body || '{}')?.method === 'tools/call';
  } catch { return false; }
}

function endpointPath(endpoint: ApiEndpoint): string {
  const params = new URLSearchParams();
  endpoint.queryParams?.forEach((param) => {
    if (param.default) params.set(param.name, param.default);
  });
  const query = params.toString();
  return query ? `${endpoint.path}?${query}` : endpoint.path;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export const useApiGateway = (authHeaders: Record<string, string>) => {
  const [selectedSuite, setSelectedSuite] = useState<'all' | 'safety' | 'intel' | 'free' | 'keys'>('free');
  const [methodFilter, setMethodFilter] = useState<'all' | 'GET' | 'POST'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>(initialEndpoint);
  const [requestMethod, setRequestMethod] = useState<RequestMethod>(initialEndpoint.method);
  const [requestPath, setRequestPath] = useState(() => endpointPath(initialEndpoint));
  const [requestHeadersText, setRequestHeadersText] = useState('{}');
  const [requestBodyText, setRequestBodyText] = useState('');
  const [exampleNotice, setExampleNotice] = useState('');
  const isMeteredRequest = isMeteredToolCall(requestPath, requestBodyText);
  const [trialCallsRemaining, setTrialCallsRemaining] = useState(27);
  useEffect(() => {
    fetch('/api/trial/status').then((response) => response.ok ? response.json() : null)
      .then((body) => { if (Number.isFinite(body?.callsRemaining)) setTrialCallsRemaining(body.callsRemaining); })
      .catch(() => undefined);
  }, []);
  const sampleGeneration = useRef(0);

  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState<TestExecutionResult | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [serverLogs, setServerLogs] = useState<ServerAccessLog[]>([]);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchStats, setBatchStats] = useState<{ total: number; passed: number; failed: number; avgLatency: number } | null>(null);

  const addServerLog = (method: string, path: string, status: number, latencyMs: number) => {
    const newLog: ServerAccessLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      status,
      latencyMs,
    };
    setServerLogs((previous) => [newLog, ...previous.slice(0, 49)]);
  };

  const filteredEndpoints = useMemo(() => API_ENDPOINTS.filter((endpoint) => {
    const matchesSuite = selectedSuite === 'all' || endpoint.suite === selectedSuite;
    const matchesMethod = methodFilter === 'all' || endpoint.method === methodFilter;
    const query = searchQuery.toLowerCase();
    const matchesSearch = !query || endpoint.name.toLowerCase().includes(query) ||
      endpoint.path.toLowerCase().includes(query) || endpoint.category.toLowerCase().includes(query) ||
      endpoint.summary.toLowerCase().includes(query) || endpoint.description.toLowerCase().includes(query) ||
      endpoint.tags.some((tag) => tag.toLowerCase().includes(query));
    return matchesSuite && matchesMethod && matchesSearch;
  }), [selectedSuite, methodFilter, searchQuery]);

  const handleSelectEndpoint = async (endpoint: ApiEndpoint) => {
    const generation = ++sampleGeneration.current;
    setSelectedEndpoint(endpoint);
    setRequestMethod(endpoint.method);
    setRequestPath(endpointPath(endpoint));
    setTestResult(null);
    setExampleNotice('');

    if (endpoint.method !== 'POST') {
      setRequestBodyText('');
      return;
    }

    if (endpoint.sampleRequestBody?.transaction) {
      setRequestBodyText(JSON.stringify({ transaction: '', network: 'devnet' }, null, 2));
      setExampleNotice('Preparing a signed, throwaway devnet transaction with a fresh blockhash…');
      try {
        const blockhashResponse = await fetch('/api/solana/blockhash?network=devnet');
        const blockhashData = await blockhashResponse.json();
        if (!blockhashResponse.ok || typeof blockhashData.blockhash !== 'string') {
          throw new Error(blockhashData.error || 'Could not load a fresh devnet blockhash.');
        }

        const payer = Keypair.generate();
        const recipient = Keypair.generate().publicKey;
        const message = new TransactionMessage({
          payerKey: payer.publicKey,
          recentBlockhash: blockhashData.blockhash,
          instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: 1 })],
        }).compileToV0Message();
        const transaction = new VersionedTransaction(message);
        transaction.sign([payer]);

        if (generation === sampleGeneration.current) {
          setRequestBodyText(JSON.stringify({ transaction: Buffer.from(transaction.serialize()).toString('base64'), network: 'devnet' }, null, 2));
          setExampleNotice('Fresh signed devnet example ready. It uses a throwaway unfunded wallet and is never broadcast.');
        }
      } catch (error) {
        if (generation === sampleGeneration.current) {
          setExampleNotice(error instanceof Error ? `${error.message} Paste a serialized VersionedTransaction to continue.` : 'Could not prepare an example. Paste a serialized VersionedTransaction to continue.');
        }
      }
      return;
    }

    setRequestBodyText(JSON.stringify(endpoint.sampleRequestBody ?? endpoint.defaultParams ?? {}, null, 2));
  };

  const loadPreset = (preset: Record<string, string>) => {
    try {
      const url = new URL(requestPath, window.location.origin);
      Object.entries(preset).forEach(([key, value]) => url.searchParams.set(key, value));
      setRequestPath(`${url.pathname}${url.search}`);
    } catch {
      // Keep the current request path if it is still being edited.
    }
  };

  const parseHeaders = (): Record<string, string> => {
    const parsed = requestHeadersText.trim() ? JSON.parse(requestHeadersText) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Headers must be a JSON object.');
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  };

  const handleExecuteRequest = async (triggerTypo = false) => {
    let url: URL;
    let headers: Record<string, string>;
    try {
      url = new URL(triggerTypo && selectedEndpoint.typoPath ? selectedEndpoint.typoPath : requestPath, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error('Requests are limited to this gateway origin.');
      headers = { ...authHeaders, ...parseHeaders() };
    } catch (error) {
      setTestResult({
        endpointId: selectedEndpoint.id,
        url: requestPath,
        method: requestMethod,
        status: 0,
        latencyMs: 0,
        timestamp: new Date().toLocaleTimeString(),
        headers: {},
        responseBody: { error: error instanceof Error ? error.message : 'Invalid request configuration' },
      });
      return;
    }

    const pathAndQuery = `${url.pathname}${url.search}`;
    const isMetered = isMeteredToolCall(pathAndQuery, requestBodyText);
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod) && !selectedEndpoint.readOnly;
    if ((isMetered && trialCallsRemaining === 0) || isMutating) {
      const warnings = [
        ...(isMetered && trialCallsRemaining === 0 ? [Object.keys(authHeaders).length > 0
          ? 'Your visitor trial is used. This request will cost one credit (0.0022 SOL) if it succeeds.'
          : 'Your visitor trial is used. Add an API key to run paid calls after the trial.'] : []),
        ...(isMutating ? ['This request may change account or server state.'] : []),
      ];
      if (!window.confirm(`${warnings.join('\n')}\n\nSend ${requestMethod} ${pathAndQuery}?`)) return;
    }

    setIsExecuting(true);
    const startedAt = performance.now();
    try {
      const hasBody = !['GET', 'HEAD'].includes(requestMethod) && requestBodyText.length > 0;
      const requestHeaders = { ...headers };
      if (hasBody && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {
        requestHeaders['Content-Type'] = 'application/json';
      }
      const response = await fetch(url, {
        method: requestMethod,
        headers: requestHeaders,
        body: hasBody ? requestBodyText : undefined,
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      const contentType = response.headers.get('content-type') || '';
      const responseBody = contentType.includes('json')
        ? await response.json().catch(() => ({ error: 'The gateway returned invalid JSON.' }))
        : await response.text();
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const trialRemainingHeader = response.headers.get('x-trial-calls-remaining');
      if (trialRemainingHeader !== null) setTrialCallsRemaining(Number(trialRemainingHeader));
      const mcpTrialRemaining = responseBody && typeof responseBody === 'object'
        ? responseBody.result?._meta?.trialCallsRemaining
        : undefined;
      if (Number.isFinite(mcpTrialRemaining)) setTrialCallsRemaining(mcpTrialRemaining);
      else if (isMetered && url.pathname === '/mcp') {
        const status = await fetch('/api/trial/status').then((r) => r.ok ? r.json() : null).catch(() => null);
        if (Number.isFinite(status?.callsRemaining)) setTrialCallsRemaining(status.callsRemaining);
      }
      addServerLog(requestMethod, pathAndQuery, response.status, latencyMs);
      window.dispatchEvent(new Event('pulse:call-done'));
      setTestResult({
        endpointId: selectedEndpoint.id,
        url: pathAndQuery,
        method: requestMethod,
        status: response.status,
        latencyMs,
        timestamp: new Date().toLocaleTimeString(),
        headers: responseHeaders,
        responseBody,
      });
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      addServerLog(requestMethod, pathAndQuery, 0, latencyMs);
      setTestResult({
        endpointId: selectedEndpoint.id,
        url: pathAndQuery,
        method: requestMethod,
        status: 0,
        latencyMs,
        timestamp: new Date().toLocaleTimeString(),
        headers: {},
        responseBody: { error: error instanceof Error ? error.message : 'Request failed.' },
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRunBatchTestSuite = async () => {
    setIsBatchTesting(true);
    setBatchProgress(0);
    const testable = API_ENDPOINTS.filter((endpoint) =>
      endpoint.suite === 'free' && endpoint.method === 'GET' &&
      (endpoint.queryParams || []).every((param) => !param.required || Boolean(param.default))
    );
    let passed = 0;
    let totalLatency = 0;
    for (let i = 0; i < testable.length; i++) {
      const endpoint = testable[i];
      const path = endpointPath(endpoint);
      const startedAt = performance.now();
      let status = 0;
      try {
        const response = await fetch(path);
        status = response.status;
      } catch {
        status = 0;
      }
      const latencyMs = Math.round(performance.now() - startedAt);
      addServerLog(endpoint.method, path, status, latencyMs);
      totalLatency += latencyMs;
      if (status >= 200 && status < 300) passed++;
      setBatchProgress(i + 1);
    }
    setBatchStats({
      total: testable.length,
      passed,
      failed: testable.length - passed,
      avgLatency: testable.length ? Math.round(totalLatency / testable.length) : 0,
    });
    setIsBatchTesting(false);
  };

  const generatedCurl = useMemo(() => {
    let headers: Record<string, string> = {};
    try { headers = { ...authHeaders, ...parseHeaders() }; } catch { /* Invalid JSON is shown by the header editor. */ }
    let url: string;
    try { url = new URL(requestPath || '/', window.location.origin).toString(); }
    catch { return '# Fix the request path before copying this cURL command.'; }
    const hasBody = !['GET', 'HEAD'].includes(requestMethod) && requestBodyText.length > 0;
    if (hasBody && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    const urlObj = new URL(url);
    const isDataCall = urlObj.pathname.startsWith('/api/solana/') || isMeteredToolCall(requestPath, requestBodyText);
    const parts = [
      `curl -X ${requestMethod}`,
      ...(isDataCall ? ['--cookie pulse-trial-cookies.txt', '--cookie-jar pulse-trial-cookies.txt'] : []),
      shellQuote(url),
    ];
    Object.entries(headers).forEach(([key, value]) => parts.push(`-H ${shellQuote(`${key}: ${value}`)}`));
    if (!['GET', 'HEAD'].includes(requestMethod) && requestBodyText) parts.push(`--data-raw ${shellQuote(requestBodyText)}`);
    return parts.join(' \\\n  ');
  }, [requestMethod, requestPath, requestHeadersText, requestBodyText, authHeaders]);

  const copyCurl = async () => {
    await navigator.clipboard.writeText(generatedCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const copyAllLogs = async () => {
    const formatted = serverLogs.map((log) => `[${log.timestamp}] ${log.method} ${log.path} -> ${log.status} (${log.latencyMs}ms)`).join('\n');
    await navigator.clipboard.writeText(formatted);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return {
    state: {
      selectedSuite,
      authHeaders,
      methodFilter,
      searchQuery,
      selectedEndpoint,
      requestMethod,
      requestPath,
      requestHeadersText,
      requestBodyText,
      exampleNotice,
      methods,
      isMeteredRequest,
      trialCallsRemaining,
      isExecuting,
      testResult,
      copiedCurl,
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
      setRequestMethod,
      setRequestPath,
      setRequestHeadersText,
      setRequestBodyText,
      handleExecuteRequest,
      handleRunBatchTestSuite,
      copyCurl,
      copyAllLogs,
      setServerLogs,
      loadPreset,
    },
  };
};
