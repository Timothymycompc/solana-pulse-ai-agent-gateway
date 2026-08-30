import { DiagnosticIssue } from '../types';

export const DIAGNOSTIC_ISSUES: DiagnosticIssue[] = [
  {
    id: 'issue-01',
    title: 'Pydantic-Core / Maturin Rust Compilation Failure in Termux',
    severity: 'critical',
    category: 'dependency',
    summary: 'Cargo build finished with exit status 101 during pydantic-core wheel compilation on Python 3.14/Termux',
    detectedLogSnippet: `error: command ['maturin', 'pep517', 'build-wheel', '-i', '/data/data/com.termux/files/usr/bin/python3.14'] returned non-zero exit status 1
ERROR: Failed building wheel for pydantic-core
error: failed-wheel-build-for-install`,
    rootCause: 'Pydantic v2 relies on `pydantic-core`, which requires Rust compiler (cargo), PyO3 C-bindings, and platform-specific precompiled binary wheels. Android Termux environment lacks pre-built manylinux ARM wheels for Python 3.14.',
    fixCommand: `cat << 'EOF' > requirements.txt
fastapi==0.115.0
uvicorn==0.30.0
pydantic<2.0.0
requests==2.31.0
EOF
pip install -r requirements.txt`,
    fixExplanation: 'Pydantic v1.10.x is 100% pure Python with zero Rust/C compilation requirements. It installs instantly in sub-second time on any Termux/Android shell without needing Cargo.',
    isResolved: true
  },
  {
    id: 'issue-02',
    title: '404 Not Found on API Gateway Endpoints (/v1/solana, /v1/mcp, /v1/dataweave)',
    severity: 'critical',
    category: 'routing_404',
    summary: 'test_gateway.sh reported Status: 404 for Solana risk-score, MCP discover-tools, and DataWeave vectorize-text',
    detectedLogSnippet: `=== API Gateway Test Initiated ===
Testing GET https://master-api-gateway-1021990235790.europe-west1.run.app/v1/solana/token/risk-score
Status: 404
Testing POST https://.../v1/mcp/discover-tools
Status: 404
Testing POST https://.../v1/dataweave/ml/vectorize-text
Status: 404`,
    rootCause: 'Two combined causes: 1) Router files (e.g. `routers/solana_pulse.py`) were not included via `app.include_router()`, or 2) URL path typo (`/v1/solans/` or missing nested prefix `/v1/solana/token/risk-score`).',
    fixCommand: `python -c "import main; print('Mounted routes:', [r.path for r in main.app.routes])"`,
    fixExplanation: 'Mount all three router suites in `main.py` with explicit prefixes: `prefix="/v1/solana"`, `prefix="/v1/mcp"`, and `prefix="/v1/dataweave"`.',
    isResolved: false
  },
  {
    id: 'issue-03',
    title: 'Termux Alias & Proot-Distro Environment Warnings',
    severity: 'warning',
    category: 'termux',
    summary: 'bash: alias: login: not found repeated during terminal session initialization',
    detectedLogSnippet: `bash: alias: login: not found
alias debian='proot-distro'
bash: alias: login: not found`,
    rootCause: 'A malformed alias or shell function in `~/.bashrc` or `~/.bash_profile` calling `alias login` with incorrect syntax or unquoted arguments in Termux.',
    fixCommand: `sed -i '/alias login/d' ~/.bashrc ~/.bash_profile 2>/dev/null || true`,
    fixExplanation: 'Removes the corrupted login alias from shell startup scripts so bash boots cleanly without error spam.',
    isResolved: false
  }
];
