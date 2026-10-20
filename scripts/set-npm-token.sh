#!/bin/bash
# Stores your npm access token (npmjs.com, Access Tokens, Generate New Token, Granular: packages read and write) in
# Secret Manager as NPM_TOKEN, for publishing the Agent Kit plugin (npm run publish-agent-kit). Asks for the token so it
# never lands in shell history or a file.
set -uo pipefail
read -rsp "Paste your npm token (input hidden), then press Enter: " KEY; echo
[ -z "$KEY" ] && { echo "No token entered."; exit 1; }
echo "Testing the token..."
WHO=$(curl -s -m 15 https://registry.npmjs.org/-/whoami -H "authorization: Bearer $KEY" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
[ -n "$WHO" ] || { echo "npm did not accept that token. Nothing was saved."; exit 1; }
if gcloud secrets describe NPM_TOKEN >/dev/null 2>&1; then
  printf %s "$KEY" | gcloud secrets versions add NPM_TOKEN --data-file=- >/dev/null || exit 1
else
  printf %s "$KEY" | gcloud secrets create NPM_TOKEN --data-file=- >/dev/null || exit 1
fi
echo "Done: saved the token for npm user $WHO. Publish with: npm run publish-agent-kit"
