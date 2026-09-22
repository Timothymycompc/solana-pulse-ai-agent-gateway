#!/usr/bin/env bash
set -e

echo "=========================================="
echo "1. Installing log-streaming dependency"
echo "=========================================="
sudo apt-get update -y && sudo apt-get install -y google-cloud-cli-log-streaming

echo "=========================================="
echo "2. Fetching recent Cloud Run logs"
echo "=========================================="
gcloud beta run services logs read solana-pulse-gateway --region=us-central1 --limit=20

echo "=========================================="
echo "3. Checking Git status & Mintlify doc files"
echo "=========================================="
git status

if [ -f "docs/mint.json" ] || [ -f "mint.json" ]; then
  echo "Mintlify config found. Staging changes..."
  git add .
  git commit -m "docs: update API schemas and headers for Solana Pulse AI Agent Gateway" || echo "No changes to commit."
  git push origin main || echo "Git push skipped or up to date."
fi

echo "=========================================="
echo "Done! All tasks completed."
echo "=========================================="
