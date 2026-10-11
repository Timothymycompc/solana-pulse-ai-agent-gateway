#!/usr/bin/env bash
# Sends all visitors to the newest version of the site (use after a restart or if the site is stuck on an old version).
set -uo pipefail
gcloud run services update-traffic solana-pulse-gateway --region us-central1 --to-latest --quiet || exit 1
sleep 5
curl -s -m 30 https://solana-pulse-gateway-1021990235790.us-central1.run.app/api/trial/status | grep -q freeCallsPerTool && echo "OK: site is live on the newest version and reading the database." || echo "Site did not answer the database check yet; wait a minute and retry, or paste this to Claude."
