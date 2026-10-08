#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_URL="https://solana-pulse-gateway-1021990235790.us-central1.run.app/api/payments/helius-webhook"
AUTH_HEADER="Authorization: 4df19da4b5c7edb3bbd9d7b9d0b7b4eacae7ad19cc672929f0249a08e25055ad"
SENDER_WALLET="EUNN9szXPHm9MANtGgGbEJPeLZuKBkiNDeXrA9EbdxS6"
PAYOUT_WALLET="Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU"
FAKE_SIG="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 88 || true)"
NOW=$(date +%s)

PAYLOAD=$(printf '[{"description":"%s transferred 1 SOL to %s","type":"TRANSFER","source":"SYSTEM_PROGRAM","fee":5000,"feePayer":"%s","signature":"%s","slot":0,"timestamp":%s,"nativeTransfers":[{"fromUserAccount":"%s","toUserAccount":"%s","amount":1000000000}],"tokenTransfers":[],"accountData":[{"account":"%s","nativeBalanceChange":-1000005000,"tokenBalanceChanges":[]},{"account":"%s","nativeBalanceChange":1000000000,"tokenBalanceChanges":[]}]}]' \
  "$SENDER_WALLET" "$PAYOUT_WALLET" "$SENDER_WALLET" "$FAKE_SIG" "$NOW" "$SENDER_WALLET" "$PAYOUT_WALLET" "$SENDER_WALLET" "$PAYOUT_WALLET")

echo "POSTing simulated webhook to: ${WEBHOOK_URL}"
echo "Fake signature used: ${FAKE_SIG}"
echo

timeout 30 curl -sS -w "\n\nHTTP_STATUS:%{http_code}\n" \
  -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "${AUTH_HEADER}" \
  -d "${PAYLOAD}"
