export interface ApiEndpoint {
  isLive?: boolean;
  priceLamports?: number;
  defaultParams?: Record<string, any>;
  id: string;
  suite: 'safety' | 'intel' | 'free' | 'keys';
  name: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  path: string;
  typoPath?: string;
  summary: string;
  description: string;
  category: string;
  queryParams?: { name: string; type: string; required: boolean; default?: string; description: string }[];
  pathParams?: { name: string; type: string; required: boolean; description: string }[];
  presets?: { label: string; params: Record<string, string> }[];
  requestBodySchema?: Record<string, any>;
  sampleRequestBody?: Record<string, any>;
  sampleResponse: Record<string, any>;
  tags: string[];
  /** The MCP JSON-RPC call is POST-based but the tool itself is read-only. */
  readOnly?: boolean;
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
