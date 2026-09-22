const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL, connectionTimeoutMillis: 8000 });
(async () => {
  const tables = await pool.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name`);
  console.log('--- all tables in this database ---');
  console.table(tables.rows);

  for (const row of tables.rows) {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [row.table_schema, row.table_name]);
    console.log(`--- ${row.table_schema}.${row.table_name} ---`);
    console.table(cols.rows);
  }
  process.exit(0);
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
