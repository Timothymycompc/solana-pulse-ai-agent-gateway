const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL, connectionTimeoutMillis: 8000 });
(async () => {
  const wallet = "5GuzhMZDWAHoEZiJZiqtiJ7op7KmFE7VqW6f9irJKrSH";
  const credits = 10000;
  const r = await pool.query(
    `INSERT INTO wallets (address, paid_credits, total_paid_credits_ever, last_active_at)
     VALUES ($1, $2, $2, NOW())
     ON CONFLICT (address) DO UPDATE SET
       paid_credits = wallets.paid_credits + $2,
       total_paid_credits_ever = wallets.total_paid_credits_ever + $2,
       last_active_at = NOW()
     RETURNING address, paid_credits, total_paid_credits_ever`,
    [wallet, credits]
  );
  console.log(r.rows[0]);
  process.exit(0);
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
