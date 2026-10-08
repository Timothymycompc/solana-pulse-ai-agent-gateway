const fs = require('fs');
const targetFile = 'src/components/SecureWalletClaim.tsx';

if (!fs.existsSync(targetFile)) {
  console.error("File not found: " + targetFile);
  process.exit(1);
}

let content = fs.readFileSync(targetFile, 'utf8');

// 1. Swap the default import for a named destructured import
content = content.replace(
  /import bs58 from 'bs58';/g, 
  "import { encode as encodeBase58 } from 'bs58';"
);

// 2. Update the function call to use the direct import
content = content.replace(
  /const signatureBase58 = bs58\.encode\(signatureBytes\);/g, 
  "const signatureBase58 = encodeBase58(signatureBytes);"
);

fs.writeFileSync(targetFile, content);
console.log("✓ Successfully patched bs58 import for Vite compatibility.");
