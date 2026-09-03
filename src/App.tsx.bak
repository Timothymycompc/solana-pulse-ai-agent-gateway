import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { FileAuditScanner } from './components/FileAuditScanner';
import { ApiGatewaySandbox } from './components/ApiGatewaySandbox';
import { DiagnosticCenter } from './components/DiagnosticCenter';
import { BashScriptStudio } from './components/BashScriptStudio';
import { AgentMonetizationStudio } from './components/AgentMonetizationStudio';
import { SolanaRpcBridge } from './components/SolanaRpcBridge';
import { SolanaDevnetWalletStudio } from './components/SolanaDevnetWalletStudio';
import { AiAgentDiscoveryStudio } from './components/AiAgentDiscoveryStudio';
import { AutomatedPromotionStudio } from './components/AutomatedPromotionStudio';
import { OwnerAnalyticsPortal } from './components/OwnerAnalyticsPortal';
import { ScannedFile } from './types';

// Initial simulated sample repository data for instant preview
const SAMPLE_CLEAN_REPO: ScannedFile[] = [
  {
    id: 'f-1',
    name: 'main.py',
    path: 'main.py',
    size: 2140,
    extension: 'py',
    type: 'text/x-python',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `# Master API Gateway
from fastapi import FastAPI
from routers import solana_pulse, mcp_core, dataweave_ml

app = FastAPI(title="Master API Gateway")
app.include_router(solana_pulse.router, prefix="/v1/solana")
app.include_router(mcp_core.router, prefix="/v1/mcp")
app.include_router(dataweave_ml.router, prefix="/v1/dataweave")
`
  },
  {
    id: 'f-2',
    name: 'test_gateway.sh',
    path: 'test_gateway.sh',
    size: 890,
    extension: 'sh',
    type: 'application/x-sh',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `#!/bin/bash
echo "=== API Gateway Test Initiated ==="
curl -s http://localhost:3000/v1/solana/token/risk-score?mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
`
  },
  {
    id: 'f-3',
    name: 'requirements.txt',
    path: 'requirements.txt',
    size: 94,
    extension: 'txt',
    type: 'text/plain',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `fastapi==0.115.0
uvicorn==0.30.0
pydantic<2.0.0
requests==2.31.0
`
  },
  {
    id: 'f-4',
    name: 'pydantic-1.10.18 (Pure Python)',
    path: 'site-packages/pydantic/__init__.py',
    size: 14200,
    extension: 'py',
    type: 'text/x-python',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `# Pydantic v1.10.18 (Pure-Python Mode)
# No Rust, no Cargo, no Maturin build required.
# 100% Native ARM / Termux & aarch64 Python Compatibility.`
  },
  {
    id: 'f-5',
    name: '.bashrc',
    path: '.bashrc',
    size: 420,
    extension: 'bashrc',
    type: 'text/plain',
    isDotfile: true,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'hidden',
    contentPreview: `alias debian='proot-distro'
alias ll='ls -la'
`
  },
  {
    id: 'f-6',
    name: 'solana_pulse.py',
    path: 'routers/solana_pulse.py',
    size: 4120,
    extension: 'py',
    type: 'text/x-python',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `from fastapi import APIRouter
router = APIRouter()
@router.get("/token/risk-score")
def get_risk(mint: str):
    return {"risk_score": 92, "mint": mint}
`
  },
  {
    id: 'f-7',
    name: 'mcp_core.py',
    path: 'routers/mcp_core.py',
    size: 3890,
    extension: 'py',
    type: 'text/x-python',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `from fastapi import APIRouter
router = APIRouter()
@router.post("/mcp/discover-tools")
def discover():
    return {"tools": ["solana_audit", "text_vectorizer"]}
`
  },
  {
    id: 'f-8',
    name: 'dataweave_ml.py',
    path: 'routers/dataweave_ml.py',
    size: 3450,
    extension: 'py',
    type: 'text/x-python',
    isDotfile: false,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'compatible',
    contentPreview: `from fastapi import APIRouter
router = APIRouter()
@router.post("/ml/vectorize-text")
def vectorize(req: dict):
    return {"dimensions": 8, "embedding": [0.42, -0.89, 0.12]}
`
  },
  {
    id: 'f-9',
    name: '.env.example',
    path: '.env.example',
    size: 150,
    extension: 'env',
    type: 'text/plain',
    isDotfile: true,
    isBinary: false,
    isHeavyCompileRisk: false,
    status: 'hidden',
    contentPreview: `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
RAPIDAPI_KEY=your_key_here
`
  }
];

// Heavy rust simulation repo
const SAMPLE_HEAVY_RUST_REPO: ScannedFile[] = [
  ...SAMPLE_CLEAN_REPO.filter(f => f.id !== 'f-4'),
  {
    id: 'f-4-heavy',
    name: 'pydantic_core-2.27.2-cp314-cp314-linux_aarch64.whl',
    path: 'tmp/pip-build/pydantic_core-2.27.2-cp314-cp314-linux_aarch64.whl',
    size: 2840000,
    extension: 'whl',
    type: 'application/octet-stream',
    isDotfile: false,
    isBinary: true,
    isHeavyCompileRisk: true,
    status: 'compile-risk',
    contentPreview: '[Binary Wheel: Requires Rust/Cargo compilation environment]'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'api' | 'solana_rpc' | 'devnet_wallet' | 'promo' | 'ai_discovery' | 'diagnostic' | 'scripts' | 'monetization' | 'owner_analytics'>('owner_analytics');
  const [files, setFiles] = useState<ScannedFile[]>(SAMPLE_CLEAN_REPO);
  const [isServerRunning, setIsServerRunning] = useState<boolean>(true);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  const gatewayStatus: 'online' | 'offline' | 'checking' = isCheckingHealth
    ? 'checking'
    : isServerRunning
    ? 'online'
    : 'offline';

  // Instant responsive health check
  const checkGatewayHealth = useCallback(() => {
    setIsCheckingHealth(true);
    setTimeout(() => {
      setIsCheckingHealth(false);
    }, 350);
  }, []);

  const handleToggleServer = useCallback(() => {
    setIsServerRunning(prev => !prev);
  }, []);

  const handleLoadSampleRepo = (repoType: 'termux_gateway' | 'fastapi_suite' | 'clean_python' | 'heavy_rust') => {
    if (repoType === 'termux_gateway' || repoType === 'heavy_rust') {
      setFiles(SAMPLE_HEAVY_RUST_REPO);
    } else if (repoType === 'fastapi_suite' || repoType === 'clean_python') {
      setFiles(SAMPLE_CLEAN_REPO);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        gatewayStatus={gatewayStatus}
        isServerRunning={isServerRunning}
        onToggleServer={handleToggleServer}
        onRefreshHealth={checkGatewayHealth}
        totalScannedFiles={files.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'scanner' && (
          <FileAuditScanner
            files={files}
            onFilesChange={setFiles}
            onLoadSampleRepo={handleLoadSampleRepo}
          />
        )}

        {activeTab === 'api' && (
          <ApiGatewaySandbox
            gatewayStatus={gatewayStatus}
            isServerRunning={isServerRunning}
            setIsServerRunning={setIsServerRunning}
          />
        )}

        {activeTab === 'solana_rpc' && (
          <SolanaRpcBridge />
        )}

        {activeTab === 'devnet_wallet' && (
          <SolanaDevnetWalletStudio />
        )}

        {activeTab === 'promo' && (
          <AutomatedPromotionStudio />
        )}

        {activeTab === 'ai_discovery' && (
          <AiAgentDiscoveryStudio />
        )}

        {activeTab === 'monetization' && (
          <AgentMonetizationStudio />
        )}

        {activeTab === 'diagnostic' && (
          <DiagnosticCenter />
        )}

        {activeTab === 'scripts' && (
          <BashScriptStudio />
        )}

        {activeTab === 'owner_analytics' && (
          <OwnerAnalyticsPortal />
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        <p>
          Master API Gateway Suite &bull; SolanaPulse, MCP Agentic Core, and DataWeave ML &bull; Built with FastAPI & React
        </p>
      </footer>
    </div>
  );
}
