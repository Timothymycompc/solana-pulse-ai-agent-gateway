#!/bin/bash
# Publishes agent-kit/ (solana-agent-kit-plugin-pulse) to npm with the NPM_TOKEN from Secret Manager, after checking its
# tool list is current and its tests pass. Only for the first release: npm's Trusted Publishing can only be set up on a
# package that exists. After that, .github/workflows/publish-agent-kit.yml publishes without a token: bump
# agent-kit/package.json's version (and PLUGIN_VERSION in agent-kit/src/client.ts), since npm never takes a version twice.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx --test tests/agent-kit.test.ts >/dev/null || { echo "The plugin's tool list is behind the registry. Run: npm run agent-kit"; exit 1; }
TOKEN=$(gcloud secrets versions access latest --secret=NPM_TOKEN 2>/dev/null) || { echo "No NPM_TOKEN in Secret Manager. Run: npm run set-npm-token"; exit 1; }
cd agent-kit
[ -d node_modules ] || npm install --no-audit --no-fund
npm run build
npm test
# The token goes in a throwaway npm config that is deleted when this script ends.
RC=$(mktemp); trap 'rm -f "$RC"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\n' "$TOKEN" > "$RC"
NPM_CONFIG_USERCONFIG="$RC" npm publish --access public
echo "Published: https://www.npmjs.com/package/solana-agent-kit-plugin-pulse"
