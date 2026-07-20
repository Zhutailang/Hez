import "dotenv/config";
import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth, signToken, type AuthedRequest } from "./auth.js";
import { LIVEKIT_URL, createRoomToken } from "./livekit.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "hez" });
});

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  displayName: z.string().trim().min(1).max(40),
  password: z.string().min(6).max(72),
});

app.post("/api/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "参数无效" });
  }

  const { username, displayName, password } = parsed.data;
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "用户名已被占用" });
  }

  const id = nanoid();
  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare(
    "INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)",
  ).run(id, username, displayName, passwordHash);

  const user = { id, username, displayName };
  return res.status(201).json({ token: signToken(user), user });
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "请输入用户名和密码" });
  }

  const row = db
    .prepare("SELECT id, username, display_name, password_hash FROM users WHERE username = ?")
    .get(parsed.data.username) as
    | { id: string; username: string; display_name: string; password_hash: string }
    | undefined;

  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const user = { id: row.id, username: row.username, displayName: row.display_name };
  return res.json({ token: signToken(user), user });
});

app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

app.post("/api/rooms", requireAuth, (req: AuthedRequest, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "请输入房间名称" });
  }

  const id = nanoid();
  let code = makeRoomCode();
  for (let i = 0; i < 5; i += 1) {
    const clash = db.prepare("SELECT id FROM rooms WHERE code = ?").get(code);
    if (!clash) break;
    code = makeRoomCode();
  }

  db.prepare("INSERT INTO rooms (id, code, name, host_id) VALUES (?, ?, ?, ?)").run(
    id,
    code,
    parsed.data.name,
    req.user!.id,
  );

  res.status(201).json({
    room: { id, code, name: parsed.data.name, hostId: req.user!.id },
  });
});

app.get("/api/rooms", requireAuth, (_req, res) => {
  const rooms = db
    .prepare(
      `SELECT r.id, r.code, r.name, r.host_id as hostId, r.created_at as createdAt,
              u.display_name as hostName
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       ORDER BY r.created_at DESC
       LIMIT 50`,
    )
    .all();
  res.json({ rooms });
});

app.get("/api/rooms/:code", requireAuth, (req, res) => {
  const room = db
    .prepare(
      `SELECT r.id, r.code, r.name, r.host_id as hostId, r.created_at as createdAt,
              u.display_name as hostName
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       WHERE r.code = ?`,
    )
    .get(String(req.params.code).toUpperCase());

  if (!room) {
    return res.status(404).json({ error: "房间不存在" });
  }
  res.json({ room });
});

app.post("/api/rooms/:code/token", requireAuth, async (req: AuthedRequest, res) => {
  const room = db
    .prepare("SELECT id, code, name FROM rooms WHERE code = ?")
    .get(String(req.params.code).toUpperCase()) as
    | { id: string; code: string; name: string }
    | undefined;

  if (!room) {
    return res.status(404).json({ error: "房间不存在" });
  }

  const token = await createRoomToken({
    roomName: room.code,
    identity: req.user!.id,
    displayName: req.user!.displayName,
  });

  res.json({
    token,
    url: LIVEKIT_URL,
    room: { id: room.id, code: room.code, name: room.name },
  });
});

app.listen(PORT, () => {
  console.log(`[hez] API listening on http://localhost:${PORT}`);
  console.log(`[hez] LiveKit URL: ${LIVEKIT_URL}`);
});
