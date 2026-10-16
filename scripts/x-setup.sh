#!/bin/bash
# Sets up the Pulse X poster (server/x.ts):
#   1. stores the X app's four keys in Secret Manager and lets Cloud Run read them
#   2. creates a Cloud Scheduler job that calls POST /api/owner/x/run on Tuesday, Thursday and Saturday at 16:00 UTC
#      (a re-run keeps the times set with npm run x-times)
# Asks for the keys instead of taking them as arguments, so they never land in shell history.
# The keys come from developer.x.com: your app's "Keys and tokens" page, with the access token generated
# for the Pulse account and the app's permissions set to Read and Write.
set -uo pipefail
SA="1021990235790-compute@developer.gserviceaccount.com"
SVC_URL="https://solana-pulse-gateway-1021990235790.us-central1.run.app"
REGION=us-central1
JOB=pulse-x-post
SCHEDULE="0 16 * * 2,4,6"

store() {
  local name=$1 label=$2 value
  read -rsp "Paste the $label (input hidden), then press Enter (leave empty to keep the stored one): " value; echo
  if [ -z "$value" ]; then
    gcloud secrets describe "$name" >/dev/null 2>&1 && { echo "  Kept $name."; return; }
    echo "  $name is not stored yet, so it is needed."; exit 1
  fi
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf %s "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null || exit 1
  else
    printf %s "$value" | gcloud secrets create "$name" --data-file=- >/dev/null || exit 1
  fi
  gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null || exit 1
  echo "  Stored $name."
}

echo "1/2  X keys"
store X_CONSUMER_KEY "API Key (consumer key)"
store X_CONSUMER_SECRET "API Key Secret (consumer secret)"
store X_ACCESS_TOKEN "Access Token (for the Pulse account)"
store X_ACCESS_SECRET "Access Token Secret"

echo "2/2  Schedule (Tue, Thu, Sat at 16:00 UTC when new; change it with npm run x-times)"
gcloud services enable cloudscheduler.googleapis.com >/dev/null || exit 1
OWNER_KEY=$(gcloud secrets versions access latest --secret=OWNER_API_KEY) || exit 1
ARGS=(--location="$REGION" --uri="$SVC_URL/api/owner/x/run"
  --http-method=POST --update-headers="x-api-key=$OWNER_KEY" --attempt-deadline=300s)  # video posts wait for X to process the video
if gcloud scheduler jobs describe "$JOB" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${ARGS[@]}" >/dev/null || exit 1
else
  gcloud scheduler jobs create http "$JOB" "${ARGS[@]/--update-headers/--headers}" --schedule="$SCHEDULE" --time-zone=UTC >/dev/null || exit 1
fi
unset OWNER_KEY
echo "  Scheduled $JOB."
echo
echo "Done. Deploy (npm run deploy) so the server loads the keys, then preview the next post with:"
echo "  curl -s -X POST -H \"x-api-key: \$(gcloud secrets versions access latest --secret=OWNER_API_KEY)\" \"$SVC_URL/api/owner/x/run?dry=1\""
echo "To pause posting: gcloud scheduler jobs pause $JOB --location=$REGION"
