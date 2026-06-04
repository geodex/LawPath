require("dotenv").config({ quiet: true });

const bcrypt = require("bcryptjs");
const { pool } = require("../db");

async function main() {
  const fullName = process.env.SUPER_ADMIN_NAME || "LawPath Super Admin";
  const email = (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || "";

  if (!email || !password) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required.");
  }

  if (password.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `insert into users (tenant_id, full_name, email, password_hash, role, status)
     values (null, $1, $2, $3, 'platform_super_admin', 'active')
     on conflict (email) do update set
       full_name = excluded.full_name,
       password_hash = excluded.password_hash,
       role = 'platform_super_admin',
       tenant_id = null,
       status = 'active',
       updated_at = now()
     returning id, full_name, email, role`,
    [fullName, email, passwordHash]
  );

  console.log(`Super admin ready: ${result.rows[0].email}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
