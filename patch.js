const fs = require('fs');

console.log('🔄 Starting automated application patch...');

// 1. Fix the JSX comment syntax error in ApiGatewaySandbox.tsx
try {
  let sandbox = fs.readFileSync('src/components/ApiGatewaySandbox.tsx', 'utf8');
  sandbox = sandbox.replace(/\{\/\* MASTER GATEWAY SERVER CONTROL STATION \(NEW\) \*\/\}/g, '// MASTER GATEWAY SERVER CONTROL STATION (NEW)');
  fs.writeFileSync('src/components/ApiGatewaySandbox.tsx', sandbox);
  console.log('✅ Fixed comment syntax in ApiGatewaySandbox.tsx');
} catch (e) {
  console.error('❌ Failed to edit ApiGatewaySandbox.tsx:', e.message);
}

// 2. Register and import SolanaDevnetWalletStudio in App.tsx
try {
  let app = fs.readFileSync('src/App.tsx', 'utf8');
  if (!app.includes('SolanaDevnetWalletStudio')) {
    // Inject the import statement at the top
    app = app.replace("import { Header, AppTab } from './components/Header';", "import { Header, AppTab } from './components/Header';\nimport SolanaDevnetWalletStudio from './components/SolanaDevnetWalletStudio';");
    
    // Inject the conditional render block
    app = app.replace(
      "{activeTab === 'owner_studio' && <OwnerStudio />}",
      "{activeTab === 'owner_studio' && <OwnerStudio />}\n        {activeTab === 'wallet_studio' && <SolanaDevnetWalletStudio />}"
    );
    fs.writeFileSync('src/App.tsx', app);
    console.log('✅ Integrated Wallet Studio into App.tsx');
  } else {
    console.log('ℹ️ Wallet Studio already integrated in App.tsx');
  }
} catch (e) {
  console.error('❌ Failed to edit App.tsx:', e.message);
}

// 3. Add the navigation link into Header.tsx
try {
  let header = fs.readFileSync('src/components/Header.tsx', 'utf8');
  if (!header.includes('wallet_studio')) {
    // Add the tab definition into the navigation items
    header = header.replace(
      "{ id: 'owner_studio', label: 'Owner Hub', icon: Lock }",
      "{ id: 'owner_studio', label: 'Owner Hub', icon: Lock },\n  { id: 'wallet_studio', label: 'Wallet & Mint Studio', icon: Coins }"
    );
    fs.writeFileSync('src/components/Header.tsx', header);
    console.log('✅ Added navigation tab to Header.tsx');
  } else {
    console.log('ℹ️ Navigation tab already exists in Header.tsx');
  }
} catch (e) {
  console.error('❌ Failed to edit Header.tsx:', e.message);
}

console.log('🚀 Patching complete!');
