#!/bin/bash
# Starts the token_safety accuracy test on Google Cloud (server/accuracy.ts): a Cloud Scheduler job calls
# POST /api/owner/accuracy/tick every 10 minutes, so it keeps running with no computer or phone open.
# It samples 100 new tokens, then checks each one a week later. Results: npm run accuracy (or GET /api/owner/accuracy).
# Run it after deploying the code that has /api/owner/accuracy. Safe to run again (it updates the job).
set -uo pipefail
SVC_URL="https://solana-pulse-gateway-1021990235790.us-central1.run.app"
REGION=us-central1
JOB=pulse-accuracy-tick
gcloud services enable cloudscheduler.googleapis.com >/dev/null || exit 1
OWNER_KEY=$(gcloud secrets versions access latest --secret=OWNER_API_KEY) || exit 1
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $OWNER_KEY" "$SVC_URL/api/owner/accuracy")
[ "$CODE" = "200" ] || { echo "The live server has no accuracy test yet (HTTP $CODE). Deploy first: npm run deploy"; exit 1; }
ARGS=(--location="$REGION" --uri="$SVC_URL/api/owner/accuracy/tick" --http-method=POST --attempt-deadline=300s --schedule="*/10 * * * *" --time-zone=UTC)
if gcloud scheduler jobs describe "$JOB" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${ARGS[@]}" --update-headers="x-api-key=$OWNER_KEY" >/dev/null || exit 1
else
  gcloud scheduler jobs create http "$JOB" "${ARGS[@]}" --headers="x-api-key=$OWNER_KEY" >/dev/null || exit 1
fi
unset OWNER_KEY
echo "Scheduled $JOB every 10 minutes. See the results any time with: npm run accuracy"
echo "To stop it: gcloud scheduler jobs pause $JOB --location=$REGION"
