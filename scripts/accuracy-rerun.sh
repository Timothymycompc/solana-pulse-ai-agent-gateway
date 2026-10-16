#!/bin/bash
# Queues the 500 tokens of the 2026-10-16 audit for a fresh token_safety verdict on Google Cloud (accuracy.ts checks
# 15 every 10 minutes, so about 6 hours). Compare with npm run accuracy, cohort "rerun-<date>".
set -uo pipefail
SVC_URL="https://solana-pulse-gateway-1021990235790.us-central1.run.app"
COHORT="rerun-$(date -u +%Y-%m-%d)"
BODY=$(python3 -c "import json,sys;print(json.dumps({'cohort':sys.argv[1],'mints':[t['mint'] for t in json.load(open('tests/audit/2026-10-16-tokens.json'))['tokens']]}))" "$COHORT") || exit 1
OWNER_KEY=$(gcloud secrets versions access latest --secret=OWNER_API_KEY) || exit 1
curl -s -X POST "$SVC_URL/api/owner/accuracy/add" -H "x-api-key: $OWNER_KEY" -H 'content-type: application/json' -d "$BODY"; echo
echo "Queued as cohort $COHORT. Results: npm run accuracy"
