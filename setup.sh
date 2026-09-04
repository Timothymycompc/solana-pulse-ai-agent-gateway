#!/bin/bash

echo "============================================================"
echo "🚀 Archiving Old Files & Deploying New Version..."
echo "============================================================"
echo ""

# 1. Create Archive Directory with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_DIR="archive/version_$TIMESTAMP"
mkdir -p "$ARCHIVE_DIR"

echo "📦 Archiving current root files to $ARCHIVE_DIR..."
# Move existing root-level logic files to archive (if they exist)
FILES_TO_ARCHIVE=("server.ts" "db.ts" "create_test_key.ts" "rotate_db_pass.ts" "test_payment_flow.ts")

for file in "${FILES_TO_ARCHIVE[@]}"; do
  if [ -f "$file" ]; then
    mv "$file" "$ARCHIVE_DIR/"
  fi
done

# 2. Promote files from 'updated/' to root
if [ -d "updated" ]; then
  echo "🚚 Promoting new version from updated/ to root..."
  rsync -av --exclude='setup.sh' updated/ .
  echo "✅ Files promoted to root."
else
  echo "⚠️  Warning: 'updated/' directory not found. Proceeding with current root files."
fi

echo "☁️  Deploying to Cloud Run..."

gcloud run deploy solana-pulse-gateway \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --project=$(gcloud config get-value project)

# 3. Automated Discovery Pinging
if [ -f "ping_indices.sh" ]; then
  echo "📡 Pinging AI Indexing Services..."
  bash ping_indices.sh
fi

echo ""
echo "✅ Deployment complete! Look for the 'Service URL' above."
echo "That URL is your live, public endpoint for Claude Desktop, Cursor, and bots!"
