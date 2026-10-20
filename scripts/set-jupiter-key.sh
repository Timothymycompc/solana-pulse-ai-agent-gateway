#!/bin/bash
# Stores your free Jupiter API key (from portal.jup.ag) in Secret Manager as JUPITER_API_KEY and lets Cloud Run read it.
# With it, token data and sell tests use api.jup.ag under your key's limit instead of the shared keyless one, which
# turned away 27% of token checks under load in the Oct 2026 audit. Asks for the key so it never lands in shell history.
set -uo pipefail
SA="1021990235790-compute@developer.gserviceaccount.com"
CLIP=/data/data/com.termux/files/usr/bin/termux-clipboard-get
# The Claude Code "!" prompt has no keyboard input; there the key is read from the phone's clipboard (copy it first).
if [ -t 0 ] || [ ! -x "$CLIP" ]; then
  read -rsp "Paste your Jupiter API key (input hidden), then press Enter: " KEY; echo
else
  KEY=$(timeout 15 "$CLIP" | tr -d '[:space:]'); echo "Read the key from the clipboard."
fi
[ -z "$KEY" ] && { echo "No key entered."; exit 1; }
echo "Testing the key..."
CODE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "https://api.jup.ag/tokens/v2/search?query=USDC" -H "x-api-key: $KEY")
[ "$CODE" = "200" ] || { echo "Jupiter did not accept that key (HTTP $CODE). Nothing was saved."; exit 1; }
if gcloud secrets describe JUPITER_API_KEY >/dev/null 2>&1; then
  printf %s "$KEY" | gcloud secrets versions add JUPITER_API_KEY --data-file=- || exit 1
else
  printf %s "$KEY" | gcloud secrets create JUPITER_API_KEY --data-file=- || exit 1
fi
gcloud secrets add-iam-policy-binding JUPITER_API_KEY --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null && echo "Done: Cloud Run can read JUPITER_API_KEY. It takes effect on the next deploy."
# Leave no copy of the key on the clipboard.
[ -x /data/data/com.termux/files/usr/bin/termux-clipboard-set ] && printf '' | /data/data/com.termux/files/usr/bin/termux-clipboard-set
