const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');

const routeCode = `
  // Wallet Claim Status Lookup Route
  app.get("/api/wallets/claim-status", async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: "Wallet address parameter is required" });
      }

      const wallet = await db.query(
        "SELECT address, paid_credits, total_paid_credits_ever, total_sol_received_lamports, api_key FROM wallets WHERE address = $1",
        [address]
      );

      if (!wallet.rows.length) {
        return res.status(404).json({ error: "No deposit record found for this wallet address." });
      }

      const record = wallet.rows[0];
      return res.json({
        address: record.address,
        paidCredits: Number(record.paid_credits || 0),
        totalPaidCreditsEver: Number(record.total_paid_credits_ever || 0),
        totalSolReceivedLamports: Number(record.total_sol_received_lamports || 0),
        apiKey: record.api_key || null
      });
    } catch (err: any) {
      console.error("Error fetching claim status:", err);
      return res.status(500).json({ error: "Failed to query wallet claim status" });
    }
  });
`;

if (!content.includes("/api/wallets/claim-status")) {
  const insertionPoint = content.indexOf('app.post("/api/payments/helius-webhook"');
  if (insertionPoint !== -1) {
    const updated = content.slice(0, insertionPoint) + routeCode + "\n\n" + content.slice(insertionPoint);
    fs.writeFileSync('server.ts', updated);
    console.log("Successfully patched server.ts with /api/wallets/claim-status endpoint.");
  } else {
    console.error("Could not find insertion point in server.ts");
  }
} else {
  console.log("Route already present in server.ts");
}
