import "dotenv/config";
import { Pool } from "pg";

async function rotatePassword() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const newPassword = "R9sZKwu6PYdcAY1zKPK1cQ==";

  try {
    console.log("Attempting to rotate DB password...");
    await pool.query(`ALTER USER postgres WITH PASSWORD '${newPassword}';`);
    console.log("Successfully rotated DB password!");
  } catch (err) {
    console.error("Failed to rotate DB password:", err);
  } finally {
    await pool.end();
  }
}

rotatePassword();
