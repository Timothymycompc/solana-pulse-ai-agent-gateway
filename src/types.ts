export interface ScannedFile {
  id: string;
  name: string;
  path: string;
  size: number;
  extension: string;
  lastModified?: number;
  type: string;
  isDotfile: boolean;
  isBinary: boolean;
  isHeavyCompileRisk: boolean;
  status: 'compatible' | 'hidden' | 'compile-risk' | 'missing-dep' | 'empty';
  rawFile?: File;
  contentPreview?: string;
}

export interface ExtensionStat {
  ext: string;
  name: string;
  count: number;
  totalSize: number;
  color: string;
  category: 'code' | 'config' | 'document' | 'data' | 'binary' | 'hidden';
}

export interface ApiEndpoint {
  id: string;
  suite: 'solana' | 'mcp' | 'dataweave';
  name: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  path: string;
  typoPath?: string;
  summary: string;
  description: string;
  category: string;
  queryParams?: { name: string; type: string; required: boolean; default?: string; description: string }[];
  pathParams?: { name: string; type: string; required: boolean; description: string }[];
  requestBodySchema?: Record<string, any>;
  sampleRequestBody?: Record<string, any>;
  sampleResponse: Record<string, any>;
  tags: string[];
}

export interface TestExecutionResult {
  endpointId: string;
  url: string;
  method: string;
  status: number;
  latencyMs: number;
  timestamp: string;
  headers: Record<string, string>;
  responseBody: any;
  isTypoTriggered?: boolean;
}

export interface DiagnosticIssue {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'python_runtime' | 'routing_404' | 'dependency' | 'termux';
  summary: string;
  detectedLogSnippet: string;
  rootCause: string;
  fixCommand: string;
  fixExplanation: string;
  isResolved?: boolean;
}
