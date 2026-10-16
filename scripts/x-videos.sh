#!/bin/bash
# Uploads the tool videos for the X poster to a private Cloud Storage bucket the server can read.
# The videos are made by ~/pulse-video/clips.py, named NN-<tool>.mp4; each is stored as <tool>.mp4.
#   npm run x-videos                      upload from the default folder
#   npm run x-videos -- /path/to/folder   upload from another folder
set -uo pipefail
DIR=${1:-/sdcard/Download/SolanaPulse/tool-clips-current}
BUCKET=x300-506418-pulse-videos   # same as VIDEO_BUCKET in server/x.ts
SA="1021990235790-compute@developer.gserviceaccount.com"

ls "$DIR"/*.mp4 >/dev/null 2>&1 || { echo "No .mp4 files in $DIR."; exit 1; }
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location=us-central1 --uniform-bucket-level-access --public-access-prevention >/dev/null || exit 1
  echo "Created gs://$BUCKET (private)."
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectViewer >/dev/null || exit 1
for f in "$DIR"/*.mp4; do
  name=$(basename "$f" .mp4); name=${name#[0-9][0-9]-}
  gcloud storage cp --quiet "$f" "gs://$BUCKET/$name.mp4" || exit 1
  echo "  $name.mp4"
done
echo "Done: Cloud Run can read the videos in gs://$BUCKET."
