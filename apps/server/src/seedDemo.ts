import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "./db.js";

export type DemoAccount = {
  username: string;
  displayName: string;
  password: string;
};

/** Fixed local-demo accounts (password is always demo123). */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: "alice", displayName: "Alice", password: "demo123" },
  { username: "bob", displayName: "Bob", password: "demo123" },
  { username: "carol", displayName: "Carol", password: "demo123" },
];

const DEMO_ROOMS: { code: string; name: string; hostUsername: string }[] = [
  { code: "DEMO01", name: "午后闲聊", hostUsername: "alice" },
  { code: "DEMO02", name: "项目同步", hostUsername: "bob" },
  { code: "LAB777", name: "本地联调房", hostUsername: "carol" },
];

/**
 * Seed the SQLite file with fake users/rooms when empty (or when force=true).
 * Safe for local demo only — do not enable in production.
 */
export async function seedDemoDatabase(force = false) {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (row.c > 0 && !force) {
    console.log("[hez] demo db already has users, skip seed");
    return;
  }

  if (force) {
    db.exec("DELETE FROM rooms; DELETE FROM users;");
  }

  const passwordHash = await bcrypt.hash("demo123", 10);
  const insertUser = db.prepare(
    "INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)",
  );
  const insertRoom = db.prepare(
    "INSERT INTO rooms (id, code, name, host_id) VALUES (?, ?, ?, ?)",
  );

  const ids = new Map<string, string>();

  const tx = db.transaction(() => {
    for (const account of DEMO_ACCOUNTS) {
      const id = nanoid();
      ids.set(account.username, id);
      insertUser.run(id, account.username, account.displayName, passwordHash);
    }
    for (const room of DEMO_ROOMS) {
      const hostId = ids.get(room.hostUsername);
      if (!hostId) continue;
      insertRoom.run(nanoid(), room.code, room.name, hostId);
    }
  });
  tx();

  console.log("[hez] seeded demo users: alice / bob / carol (password: demo123)");
  console.log("[hez] seeded demo rooms: DEMO01, DEMO02, LAB777");
}
