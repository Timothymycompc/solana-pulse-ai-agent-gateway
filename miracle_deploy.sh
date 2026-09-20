#!/bin/bash
set -e

echo "============================================================"
echo "✨ RUNNING SOLANA PULSE MIRACLE DEPLOYER (COMPATIBILITY MODE)..."
echo "============================================================"

# 1. Promote files from 'updated/' to root using native cp
if [ -d "updated" ]; then
  echo '🚚 Promoting the premium database-integrated version from updated/ to root...'
  # Copy all files (including hidden ones) from updated/ to root
  cp -R updated/. .
  echo '✅ Files promoted successfully.'
else
  echo '❌ Error: \"updated/\" directory not found. Please make sure you are in the correct repository.'
  exit 1
fi

# 2. Fix package.json build script
echo "=== Step 2: Ensuring build scripts exist in package.json ==="
cat << 'JSON' > package.json
{
  "name": "file-visibility-audit",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    "lint": "tsc --noEmit",
    "preview": "vite preview",
    "prebuild": "./check-before-build.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "@solana/web3.js": "^1.98.4",
    "@tailwindcss/vite": "^4.3.3",
    "bs58": "^6.0.0",
    "buffer": "^6.0.3",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "lucide-react": "^1.35.0",
    "pg": "^8.23.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "recharts": "^3.10.1",
    "tailwindcss": "^4.3.3",
    "tweetnacl": "^1.0.3",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/pg": "^8.23.1",
    "@vitejs/plugin-react": "^5.0.4",
    "esbuild": "^0.28.2",
    "tsx": "^4.23.13",
    "typescript": "~5.8.2",
    "vite": "^6.2.3"
  },
  "allowScripts": {
    "esbuild": true,
    "bufferutil": true,
    "utf-8-validate@6.0.6": true
  },
  "optionalDependencies": {
    "@rollup/rollup-linux-x64-gnu": "^4.63.1"
  }
}
JSON
echo "✔ package.json configured."

# 3. Patch the promoted server.ts for Express Rate Limit Trust Proxy
echo "=== Step 3: Patching promoted server.ts for Rate Limit Trust Proxy ==="
if [ -f "server.ts" ]; then
  # Remove any legacy trust proxy patch traces to prevent duplicates
  sed -i "/app.set('trust proxy'/d" server.ts
  # Inject the trust proxy setting safely right after Express is initialized
  sed -i "s/const app = express();/const app = express();\n  app.set('trust proxy', 1);/" server.ts
  echo "✔ server.ts successfully patched."
else
  echo "❌ Error: server.ts not found in root after promotion!"
  exit 1
fi

# 4. Deploy to Google Cloud Run
echo "=== Step 4: Deploying full-featured gateway to Cloud Run ==="
gcloud run deploy solana-pulse-gateway \
  --source . \
  --region us-central1 \
  --no-async

echo "============================================================"
echo "🎉 MIRACLE DEPLOYMENT COMPLETE! All database-integrated APIs"
echo "are live, rate-limit safe, and fully synchronized!"
echo "============================================================"
