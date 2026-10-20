#!/bin/bash
# Stores your npm access token (npmjs.com, Access Tokens, Generate New Token, Granular: packages read and write) in
# Secret Manager as NPM_TOKEN, for publishing the Agent Kit plugin (npm run publish-agent-kit). Asks for the token so it
# never lands in shell history or a file.
set -uo pipefail
CLIP=/data/data/com.termux/files/usr/bin/termux-clipboard-get
# The Claude Code "!" prompt has no keyboard input; there the key is read from the phone's clipboard (copy it first).
if [ -t 0 ] || [ ! -x "$CLIP" ]; then
  read -rsp "Paste your npm token (input hidden), then press Enter: " KEY; echo
else
  KEY=$(timeout 15 "$CLIP"); echo "Read the token from the clipboard."
  # Copying a command to paste it replaces the token on the clipboard; say so instead of testing the command.
  case "$KEY" in *" "*|"!"*|*"npm run"*|*pulse-*) echo "The clipboard holds a command, not the token. Copy the token again, then TYPE the command (don't paste it)."; exit 1;; esac
  KEY=$(printf %s "$KEY" | tr -d '[:space:]')
fi
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
# Leave no copy of the token on the clipboard.
[ -x /data/data/com.termux/files/usr/bin/termux-clipboard-set ] && printf '' | /data/data/com.termux/files/usr/bin/termux-clipboard-set
