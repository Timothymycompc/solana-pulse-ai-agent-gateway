const fs = require('fs');
const path = 'src/components/ApiGatewaySandbox.tsx';

if (!fs.existsSync(path)) {
  console.error(`File not found: ${path}`);
  process.exit(1);
}

let content = fs.readFileSync(path, 'utf8');

if (!content.includes('SecureWalletClaim')) {
  // 1. Inject the import near the top
  const importStatement = "import { SecureWalletClaim } from './SecureWalletClaim';\n";
  
  // Find the last import to append ours
  const lastImportIndex = content.lastIndexOf('import ');
  if (lastImportIndex !== -1) {
    const endOfLastImport = content.indexOf('\n', lastImportIndex) + 1;
    content = content.slice(0, endOfLastImport) + importStatement + content.slice(endOfLastImport);
  } else {
    content = importStatement + content;
  }

  // 2. Inject the component at the top of the main render block
  // Looks for the first main <div> inside the return() statement
  const returnMatch = content.match(/return\s*\(\s*<div[^>]*>/);
  
  if (returnMatch) {
    const injectionPoint = returnMatch.index + returnMatch[0].length;
    const componentCode = `
        <div className="max-w-4xl mx-auto mb-6">
          <SecureWalletClaim 
            onCredentialsApplied={(apiKey, newHeaders) => {
              setHeaders((prev) => ({ ...prev, ...newHeaders }));
            }} 
          />
        </div>`;
    
    content = content.slice(0, injectionPoint) + componentCode + content.slice(injectionPoint);
    fs.writeFileSync(path, content);
    console.log("✓ Successfully injected SecureWalletClaim into ApiGatewaySandbox.tsx");
  } else {
    console.log("⚠ Could not find standard return block. Please manually add <SecureWalletClaim /> inside your sandbox container.");
  }
} else {
  console.log("✓ SecureWalletClaim is already imported in ApiGatewaySandbox.tsx");
}
