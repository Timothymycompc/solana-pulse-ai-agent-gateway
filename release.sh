#!/bin/bash
set -uo pipefail
cd ~/solana-pulse-ai-agent-gateway || exit 1
SVC=solana-pulse-gateway; REGION=us-central1
B=https://solana-pulse-gateway-1021990235790.us-central1.run.app
MSG="${1:-release $(date -u '+%Y-%m-%d %H:%M')}"
die() { echo "ABORT: $*" >&2; exit 1; }

echo "=== 1/5 safety gates"
BAD=$(git ls-files | grep -E '(^|/)(\.env|secrets\.json(\.enc)?)$' || true)
[ -z "$BAD" ] || die "secret files are tracked: $BAD"
grep -q "trust proxy" server.ts || die "server.ts has no trust proxy line"

echo "=== 2/5 build"
timeout 180 npm run build >/tmp/release_build.log 2>&1 || { tail -20 /tmp/release_build.log; die "build failed"; }

echo "=== 3/5 commit"
git add -A
if git diff --cached --name-only | grep -qE '^(node_modules|dist)/'; then git reset -q; die "node_modules or dist would be committed"; fi
HITS=$(git diff --cached --name-only -G'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[^:@/ ]+:[^@ ]+@')
if [ -n "$HITS" ]; then git reset -q; die "credential-looking content in: $HITS"; fi
git diff --cached --quiet || git commit -q -m "$MSG"
SHA=$(git rev-parse --short HEAD); echo "commit $SHA"

echo "=== 4/5 deploy"
PREV=$(gcloud run services describe $SVC --region $REGION --format='value(status.latestReadyRevisionName)')
timeout 600 gcloud run deploy $SVC --source . --region $REGION --update-labels commit=$SHA || die "deploy failed; live is still $PREV"
gcloud run services update-traffic $SVC --region $REGION --to-latest >/dev/null
NEW=$(gcloud run services describe $SVC --region $REGION --format='value(status.latestReadyRevisionName)')
echo "live: $NEW (was $PREV)"

echo "=== 5/5 live tests"
FAIL=""
curl -s -m 15 "$B/api/debug/build" | grep -q '"alive"' || FAIL="$FAIL debug/build"
curl -s -m 15 -X POST "$B/mcp" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' | grep -q serverInfo || FAIL="$FAIL /mcp"
H=$(curl -s -m 20 -o /dev/null -D - "$B/api/solana/blockhash"); S=$(echo "$H" | head -1 | awk '{print $2}')
if [ "$S" = 200 ]; then echo "$H" | grep -qi '^x-free-calls-remaining' || FAIL="$FAIL free-tier-header"; elif [ "$S" != 402 ]; then FAIL="$FAIL blockhash($S)"; fi
JS=$(curl -s -m 15 "$B/" | grep -oE 'assets/[^"]+\.js' | head -1)
[ "$(curl -s -m 30 "$B/$JS" | grep -c "Yes, I want it")" -gt 0 ] || FAIL="$FAIL new-page"
if [ -n "$FAIL" ]; then
  echo "LIVE TESTS FAILED:$FAIL. Rolling back to $PREV"
  gcloud run services update-traffic $SVC --region $REGION --to-revisions=$PREV=100
  die "rolled back. Logs: gcloud run services logs read $SVC --region $REGION --limit 50"
fi
echo "all live tests passed"

echo "=== push"
HIST=$(git log --all --oneline -- .env secrets.json secrets.json.enc updated/secrets.json updated/secrets.json.enc | head -1)
if [ -n "$HIST" ]; then echo "PUSH SKIPPED: git history contains secret files (e.g. $HIST). The site is live; scrub history before pushing."
elif git push -u origin HEAD; then echo "pushed $(git branch --show-current)"
else echo "WARNING: push failed. $SHA is live but GitHub is not updated (403 = no write access)."; fi
echo "RELEASED $SHA -> $NEW"

echo "=== push"
HIST=$(git log --all --oneline -- .env secrets.json secrets.json.enc updated/secrets.json updated/secrets.json.enc | head -1)
if [ -n "$HIST" ]; then echo "PUSH SKIPPED: git history contains secret files (e.g. $HIST). The site is live; scrub history before pushing."
elif git push -u origin HEAD; then echo "pushed $(git branch --show-current)"
else echo "WARNING: push failed. $SHA is live but GitHub is not updated (403 = no write access)."; fi
echo "RELEASED $SHA -> $NEW"
