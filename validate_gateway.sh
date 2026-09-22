#!/usr/bin/env bash

BASE_URL="https://solana-pulse-gateway-1021990235790.us-central1.run.app"

echo "=========================================="
echo "1. Checking Health / OpenAPI Endpoint"
echo "=========================================="
curl -s -i "${BASE_URL}/health" || curl -s -i "${BASE_URL}/openapi.json"
echo -e "\n"

echo "=========================================="
echo "2. Testing MCP Initialize"
echo "=========================================="
curl -s -i -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}'
echo -e "\n"

echo "=========================================="
echo "3. Testing MCP List Tools"
echo "=========================================="
curl -s -i -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}'
echo -e "\n"

