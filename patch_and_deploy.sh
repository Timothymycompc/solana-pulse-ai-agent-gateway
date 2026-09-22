#!/usr/bin/env bash
set -e 
SERVICE_NAME="solana-pulse-gateway" 
REGION="us-central1" echo "==> 
Searching for files containing bs58 
imports..." FILES=$(grep -rlE "import 
bs58|require\(['\"]bs58['\"]\)|bs58" 
. --exclude-dir=node_modules 
--exclude-dir=.git || true) if [ -z 
"$FILES" ]; then
  echo "[-] No files referencing bs58 
  were found in this directory." echo 
  " Ensure you are in the root 
  directory of your project." exit 1
fi echo "[+] Found candidate 
file(s):" echo "$FILES" echo "" for 
FILE in $FILES; do
  echo 
  "==================================================" 
  echo "=== CURRENT CONTENT OF: 
  $FILE" echo 
  "==================================================" 
  cat "$FILE" echo 
  "==================================================" 
  echo "" read -p "Apply bs58 import 
  patch to $FILE? (y/N): " CONFIRM if 
  [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    # Patch ES Module syntax
    sed -i -E "s/import bs58 from 
    ['\"]bs58['\"];?/import * as bs58 
    from 'bs58';/g" "$FILE"
    
    # Patch CommonJS syntax
    sed -i -E "s/const bs58 = 
    require\(['\"]bs58['\"]\);?/const 
    bs58Raw = require('bs58'); const 
    bs58 = bs58Raw.default || 
    bs58Raw;/g" "$FILE" echo "" echo 
    "=== UPDATED CONTENT OF: $FILE 
    ===" cat "$FILE" echo 
    "=================================================="
  else echo "Skipped patching $FILE." 
  fi
done echo "" read -p "Deploy changes 
to Google Cloud Run ($SERVICE_NAME)? 
(y/N): " DEPLOY_CONFIRM if [[ 
"$DEPLOY_CONFIRM" =~ ^[Yy]$ ]]; then
  echo "==> Deploying to Cloud 
  Run..." gcloud run deploy 
  "$SERVICE_NAME" \
    --source . \ --region "$REGION" 
  echo "==> Deployment complete!"
else echo "Deployment aborted." fi
