#!/usr/bin/env bash
# Locks the database down after the old secrets leaked to GitHub. You do not need the old password.
#   1. Turns on daily automatic backups.
#   2. Sets a new random password for the app's database user and the postgres admin user,
#      and stores the app's new connection string in Secret Manager. Passwords are never shown.
#   3. Restarts the site so it uses the new password, then checks it can reach the database.
#   4. Deletes the unused HELIUS_WEBHOOK_SECRET and leftover settings.
# Safe to run again; each run picks new passwords.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SVC=solana-pulse-gateway
REGION=us-central1
INSTANCE=solana-pulse-db

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
stop() { printf '\n\033[31mStopped:\033[0m %s\n' "$1"; exit 1; }
newpass() { python3 -c 'import secrets; print(secrets.token_urlsafe(32))'; }

echo "1/4  Daily backups"
gcloud sql instances patch $INSTANCE --backup-start-time=03:00 --quiet >/dev/null 2>&1 \
  && ok "Automatic backups on (03:00 UTC daily, kept 7 days)" || warn "Could not turn on backups; retry later."

echo "2/4  New database passwords"
OLD_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL 2>/dev/null) || stop "Could not read the DATABASE_URL secret."
DB_USER=$(OLD_URL="$OLD_URL" python3 -c 'import os,urllib.parse as u; print(u.unquote(u.urlsplit(os.environ["OLD_URL"]).username or ""))')
[ -n "$DB_USER" ] || stop "DATABASE_URL has no user name in it; nothing was changed."
gcloud sql users list --instance=$INSTANCE --format='value(name)' | grep -qx "$DB_USER" || stop "The app's user ($DB_USER) is not on $INSTANCE; nothing was changed."
ok "The site connects as user: $DB_USER"

PASS=$(newpass)
NEW_URL=$(OLD_URL="$OLD_URL" PASS="$PASS" python3 -c '
import os, urllib.parse as u
p = u.urlsplit(os.environ["OLD_URL"])
host = p.netloc.rsplit("@", 1)[1] if "@" in p.netloc else ""
netloc = u.quote(p.username, safe="") + ":" + os.environ["PASS"] + "@" + host
print(u.urlunsplit((p.scheme, netloc, p.path, p.query, p.fragment)))')
# Save the new connection string first, then change the password, so the restart picks up a working pair.
printf %s "$NEW_URL" | gcloud secrets versions add DATABASE_URL --data-file=- >/dev/null 2>&1 || stop "Could not save the new DATABASE_URL; the password was not changed."
NEW_VERSION=$(gcloud secrets versions list DATABASE_URL --filter=state=enabled --sort-by=~createTime --limit=1 --format='value(name)')
if ! gcloud sql users set-password "$DB_USER" --instance=$INSTANCE --password="$PASS" --quiet >/dev/null 2>&1; then
  gcloud secrets versions disable "$NEW_VERSION" --secret=DATABASE_URL --quiet >/dev/null 2>&1
  stop "Could not change the password, so the new connection string was switched off again. Nothing else changed."
fi
ok "New password set for $DB_USER and saved in Secret Manager"
unset PASS NEW_URL OLD_URL
if [ "$DB_USER" != postgres ]; then
  gcloud sql users set-password postgres --instance=$INSTANCE --password="$(newpass)" --quiet >/dev/null 2>&1 \
    && ok "postgres admin user given a random password (reset it any time with gcloud; you never need the old one)" \
    || warn "Could not change the postgres admin password."
fi

echo "3/4  Restarting the site with the new password"
gcloud run services update $SVC --region $REGION --quiet \
  --update-env-vars "ROTATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --remove-env-vars FREE_CALLS_PER_YEAR,SECRETS_ROTATED >/dev/null 2>&1 || stop "The restart failed. Run: npm run deploy"
URL=$(gcloud run services describe $SVC --region $REGION --format='value(status.url)')
if curl -s -m 30 "$URL/api/trial/status" | grep -q '"freeCallsPerTool"'; then ok "Site is up and reading the database"
else warn "The site did not answer the database check. Wait a minute and open $URL/status; if it still fails, paste this to Claude."; fi

echo "4/4  Removing unused secrets"
if gcloud secrets describe HELIUS_WEBHOOK_SECRET >/dev/null 2>&1; then
  gcloud secrets delete HELIUS_WEBHOOK_SECRET --quiet >/dev/null 2>&1 && ok "Deleted HELIUS_WEBHOOK_SECRET (no code uses it)" || warn "Could not delete HELIUS_WEBHOOK_SECRET."
else ok "HELIUS_WEBHOOK_SECRET already gone"; fi
OLD_VERSIONS=$(gcloud secrets versions list DATABASE_URL --filter=state=enabled --sort-by=~createTime --format='value(name)' | tail -n +2)
for v in $OLD_VERSIONS; do gcloud secrets versions disable "$v" --secret=DATABASE_URL --quiet >/dev/null 2>&1; done
[ -n "$OLD_VERSIONS" ] && ok "Old DATABASE_URL versions switched off"

printf '\n\033[32mDone.\033[0m The leaked database password no longer works.\n'
