#!/bin/bash
echo "🔍 Running pre-build sanity checks..."

FILE="src/components/ApiGatewaySandbox.tsx"
FAIL=0

if [ -f "$FILE" ]; then
  EXPORT_COUNT=$(grep -c "export default" "$FILE")
  if [ "$EXPORT_COUNT" -ne 1 ]; then
    echo "❌ $FILE has $EXPORT_COUNT 'export default' lines (expected 1)"
    FAIL=1
  else
    echo "✅ $FILE: exactly one export default"
  fi

  OPEN_BRACES=$(grep -o "{" "$FILE" | wc -l)
  CLOSE_BRACES=$(grep -o "}" "$FILE" | wc -l)
  DIFF=$((OPEN_BRACES - CLOSE_BRACES))
  if [ ${DIFF#-} -gt 10 ]; then
    echo "⚠️  $FILE: brace count differs by $DIFF (open=$OPEN_BRACES, close=$CLOSE_BRACES) — worth a manual look"
  else
    echo "✅ $FILE: brace count looks sane (open=$OPEN_BRACES, close=$CLOSE_BRACES)"
  fi
fi

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "🛑 Pre-build check failed — fix the issues above before building."
  exit 1
fi

echo "✅ All pre-build checks passed."
