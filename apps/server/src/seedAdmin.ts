import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "./db.js";

const ADMIN_USERNAME = process.env.HEZ_ADMIN_USERNAME || "Admin";
const ADMIN_PASSWORD = process.env.HEZ_ADMIN_PASSWORD || "liwei0.123";
const ADMIN_DISPLAY = process.env.HEZ_ADMIN_DISPLAY || "Admin";

/** Ensure the bootstrap admin account exists (role=admin). Password only set on create. */
export async function ensureAdminUser() {
  const row = db
    .prepare("SELECT id, role FROM users WHERE username = ?")
    .get(ADMIN_USERNAME) as { id: string; role: string } | undefined;

  if (!row) {
    const id = nanoid();
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).run(id, ADMIN_USERNAME, ADMIN_DISPLAY, passwordHash);
    console.log(`[hez] Seeded admin user: ${ADMIN_USERNAME}`);
    return;
  }

  if (row.role !== "admin") {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(row.id);
    console.log(`[hez] Promoted existing user to admin: ${ADMIN_USERNAME}`);
  }

  if (process.env.HEZ_ADMIN_RESET === "1") {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(
      passwordHash,
      row.id,
    );
    console.log(`[hez] Reset admin password for: ${ADMIN_USERNAME}`);
  }
}
