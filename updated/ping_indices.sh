#!/bin/bash
# ping_indices.sh - Automated AI Discovery Notification

SERVICE_URL=$(gcloud run services describe solana-pulse-gateway --region us-central1 --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
  echo "❌ Could not determine Service URL. Make sure the service is deployed."
  exit 1
fi

echo "🔍 Broadcasting discovery signal for $SERVICE_URL..."

# 1. Ping IndexNow (Bing / Perplexity / Yandex)
# This tells them to crawl your /llms.txt immediately
curl -s "https://www.bing.com/indexnow?url=$SERVICE_URL/llms.txt&key=402-pulse-discovery" > /dev/null
echo "✅ IndexNow Ping Dispatched (Perplexity/Bing notified)"

echo "🤖 Technical Indexing Complete. Now manually submit your manifest to glama.ai"