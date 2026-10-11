#!/bin/bash
# Stores your Helius RPC URL in Secret Manager as SOLANA_MAINNET_RPC_URL and lets Cloud Run read it.
# Asks for the key instead of taking it as an argument, so it never lands in shell history.
set -uo pipefail
SA="1021990235790-compute@developer.gserviceaccount.com"
read -rsp "Paste your NEW Helius API key (input hidden), then press Enter: " KEY; echo
[ -z "$KEY" ] && { echo "No key entered."; exit 1; }
URL="https://mainnet.helius-rpc.com/?api-key=$KEY"
echo "Testing the key..."
OK=$(curl -s -m 15 "$URL" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}')
echo "$OK" | grep -q '"result":"ok"' || { echo "Helius did not accept that key (response: ${OK:0:120}). Nothing was saved."; exit 1; }
if gcloud secrets describe SOLANA_MAINNET_RPC_URL >/dev/null 2>&1; then
  printf %s "$URL" | gcloud secrets versions add SOLANA_MAINNET_RPC_URL --data-file=- || exit 1
else
  printf %s "$URL" | gcloud secrets create SOLANA_MAINNET_RPC_URL --data-file=- || exit 1
fi
gcloud secrets add-iam-policy-binding SOLANA_MAINNET_RPC_URL --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null && echo "Done: Cloud Run can read SOLANA_MAINNET_RPC_URL. It takes effect on the next deploy."
