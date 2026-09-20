#!/bin/bash
set -e

echo "=== Step 1: Patching server.ts for express-rate-limit trust proxy ==="
if [ -f "server.ts" ]; then
  # Insert app.set('trust proxy', 1); right after app initialization
  sed -i "s/const app = express();/const app = express();\n  app.set('trust proxy', 1);/" server.ts
  echo "✔ server.ts successfully patched."
else
  echo "❌ Error: server.ts not found in the current directory."
  exit 1
fi

echo "=== Step 2: Redeploying solana-pulse-gateway ==="
# Trigger a synchronous build and deploy of your updated source code
gcloud run deploy solana-pulse-gateway \
  --source . \
  --region us-central1 \
  --no-async

echo "=== Processing complete! ==="
