#!/bin/bash
# Replaces one of the four X keys in Secret Manager, refusing anything that is not shaped like that key.
#   npm run x-key-1   API Key              25 letters/digits
#   npm run x-key-2   API Key Secret       50 letters/digits
#   npm run x-key-3   Access Token         digits, a dash, then letters/digits
#   npm run x-key-4   Access Token Secret  45 letters/digits
# The Access Token and its Secret only work together when both come from the same Regenerate click.
# Asks for the value instead of taking it as an argument, so it never lands in shell history.
set -uo pipefail
case "${1:-}" in
  1) NAME=X_CONSUMER_KEY;    LABEL="API Key";             RE='^[A-Za-z0-9]{25}$';              WANT="25 letters/digits" ;;
  2) NAME=X_CONSUMER_SECRET; LABEL="API Key Secret";      RE='^[A-Za-z0-9]{50}$';              WANT="50 letters/digits" ;;
  3) NAME=X_ACCESS_TOKEN;    LABEL="Access Token";        RE='^[0-9]{5,25}-[A-Za-z0-9]{20,60}$'; WANT="digits, a dash, then letters/digits (about 50 in all)" ;;
  4) NAME=X_ACCESS_SECRET;   LABEL="Access Token Secret"; RE='^[A-Za-z0-9]{45}$';              WANT="45 letters/digits" ;;
  *) echo "Usage: bash scripts/x-key.sh 1|2|3|4"; exit 1 ;;
esac

read -rsp "Paste the $LABEL (input hidden), then press Enter: " v; echo
v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"  # drop spaces around the paste
if ! [[ "$v" =~ $RE ]]; then
  half=$(( ${#v} / 2 ))
  if [ $(( ${#v} % 2 )) -eq 0 ] && [ "$half" -gt 0 ] && [ "${v:0:half}" = "${v:half}" ]; then
    echo "REJECTED: that was pasted twice (${#v} characters). Paste it once."
  elif [[ "$v" == AAAAAAAAAAAAAAAAAAAA* ]]; then
    echo "REJECTED: that is the Bearer Token, which cannot post. Use the $LABEL."
  else
    echo "REJECTED: got ${#v} characters; the $LABEL is $WANT."
  fi
  unset v; exit 1
fi
if [ "$(gcloud secrets versions access latest --secret="$NAME" 2>/dev/null)" = "$v" ]; then
  echo "Unchanged: Secret Manager already holds this $LABEL."; unset v; exit 0
fi
printf %s "$v" | gcloud secrets versions add "$NAME" --data-file=- >/dev/null || { unset v; exit 1; }
unset v
echo "SAVED $NAME. Run npm run x-check to test all four keys against X."
