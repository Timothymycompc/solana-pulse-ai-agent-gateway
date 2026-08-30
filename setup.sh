#!/bin/bash

echo "============================================================"
echo "🚀 Deploying Solana Pulse AI Agent Gateway to Cloud Run..."
echo "============================================================"
echo ""
echo "This script will deploy your hardened, production-ready server."
echo "NOTE: If Google Cloud Shell prompts you to authorize the API"
echo "or use Artifact Registry, press 'y' or Enter to accept."
echo ""

gcloud run deploy solana-pulse-gateway \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project=$(gcloud config get-value project)

echo ""
echo "✅ Deployment complete! Look for the 'Service URL' above."
echo "That URL is your live, public endpoint for Claude Desktop, Cursor, and bots!"
