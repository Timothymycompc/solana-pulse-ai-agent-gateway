const fs = require('fs');
const targetFile = 'src/components/ApiGatewaySandbox.tsx';

if (!fs.existsSync(targetFile)) {
  console.error("File not found: " + targetFile);
  process.exit(1);
}

let content = fs.readFileSync(targetFile, 'utf8');

// 1. Safely inject the import near the top
if (!content.includes("import { SecureWalletClaim }")) {
  const firstImport = content.indexOf('import ');
  if (firstImport !== -1) {
    const endOfFirstImport = content.indexOf('\n', firstImport) + 1;
    content = content.slice(0, endOfFirstImport) + "import { SecureWalletClaim } from './SecureWalletClaim';\n" + content.slice(endOfFirstImport);
  }
}

// 2. Safely inject the component right after the main return( wrapper
if (!content.includes("<SecureWalletClaim")) {
  const returnRegex = /(return\s*\(\s*<[^>]+>)/;
  content = content.replace(returnRegex, `$1
      <div className="w-full mb-6">
        <SecureWalletClaim 
          onCredentialsApplied={(apiKey, newHeaders) => {
            // Merge the claimed headers into the sandbox's existing header state
            if (typeof setHeaders === 'function') {
              setHeaders((prev) => ({ ...prev, ...newHeaders }));
            }
          }} 
        />
      </div>`);
}

fs.writeFileSync(targetFile, content);
console.log("✓ Successfully injected SecureWalletClaim into " + targetFile + " (Existing code preserved).");
