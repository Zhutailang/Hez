import "dotenv/config";
import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "./db.js";
import { requireAdmin, requireAuth, signToken, type AuthedRequest } from "./auth.js";
import { createRoomToken, getLivekitUrl, getRoomParticipantCounts } from "./livekit.js";
import { DEMO_ACCOUNTS, seedDemoDatabase } from "./seedDemo.js";
import { ensureAdminUser } from "./seedAdmin.js";
import {
  addLivekitEndpoint,
  adminSettingsPayload,
  removeLivekitEndpoint,
  seedSettingsFromEnv,
  updateServerSettings,
} from "./settings.js";
import { applyLivekitNodeSelection } from "./livekitControl.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DEMO_MODE = process.env.HEZ_DEMO === "1";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const corsOrigins = CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes("*")) {
        cb(null, true);
        return;
      }
      // Local / LAN / direct IP access
      if (
        /^http:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.test(origin)
      ) {
        cb(null, true);
        return;
      }
      console.warn("CORS blocked:", origin);
      cb(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());

// Avatar storage
const DB_DIR = path.dirname(process.env.DATABASE_PATH || "./data/hez.db");
const AVATAR_DIR = path.join(DB_DIR, "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (req, _file, cb) => {
      const ext = ".webp"; // normalize to webp
      cb(null, `${(req as AuthedRequest).user!.id}${ext}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 }, // 1 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("仅支持 JPG/PNG/GIF/WEBP 格式"));
    }
  },
});

// Serve avatar files
app.use("/avatars", express.static(AVATAR_DIR, {
  maxAge: "1d",
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
  },
}));

// Helper: build user response object
function userResponse(row: { id: string; username: string; display_name: string; role: string; avatar_url?: string | null }) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: (row.role === "admin" ? "admin" : "user") as "admin" | "user",
    avatarUrl: row.avatar_url || null,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "hez", demo: DEMO_MODE });
});

app.get("/api/runtime", (_req, res) => {
  const lanIp = process.env.HEZ_LAN_IP || "";
  res.json({
    lanIp,
    livekitUrl: getLivekitUrl(),
    demo: DEMO_MODE,
    // Page must stay on localhost for getUserMedia (secure context).
    preferredOrigin: "http://localhost:5173",
    demoAccounts: DEMO_MODE
      ? DEMO_ACCOUNTS.map(({ username, displayName, password }) => ({
          username,
          displayName,
          password,
        }))
      : [],
  });
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
  if (username.toLowerCase() === "admin") {
    return res.status(403).json({ error: "该用户名为系统保留" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "用户名已被占用" });
  }

  const id = nanoid();
  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare(
    "INSERT INTO users (id, username, display_name, password_hash, role) VALUES (?, ?, ?, ?, 'user')",
  ).run(id, username, displayName, passwordHash);

  const user = { id, username, displayName, role: "user" as const, avatarUrl: null };
  return res.status(201).json({ token: signToken({ id, username, displayName, role: "user" as const }), user });
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
    .prepare(
      "SELECT id, username, display_name, password_hash, role, avatar_url FROM users WHERE username = ?",
    )
    .get(parsed.data.username) as
    | {
        id: string;
        username: string;
        display_name: string;
        password_hash: string;
        role: string;
        avatar_url: string | null;
      }
    | undefined;

  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const user = userResponse(row);
  return res.json({ token: signToken(user), user });
});

app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare("SELECT id, username, display_name, role, avatar_url FROM users WHERE id = ?")
    .get(req.user!.id) as
    | { id: string; username: string; display_name: string; role: string; avatar_url: string | null }
    | undefined;
  if (!row) {
    return res.status(401).json({ error: "用户不存在" });
  }
  res.json({ user: userResponse(row) });
});

// Update display name
const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

app.put("/api/auth/me", requireAuth, (req: AuthedRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "参数无效" });
  }
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(parsed.data.displayName, req.user!.id);
  const row = db
    .prepare("SELECT id, username, display_name, role, avatar_url FROM users WHERE id = ?")
    .get(req.user!.id) as { id: string; username: string; display_name: string; role: string; avatar_url: string | null };
  res.json({ user: userResponse(row) });
});

// Upload avatar
app.post("/api/auth/me/avatar", requireAuth, (req: AuthedRequest, res) => {
  avatarUpload.single("avatar")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "头像文件不能超过 1MB" });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "请选择头像文件" });
    }

    const userId = req.user!.id;
    const avatarUrl = `/avatars/${req.file.filename}`;
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, userId);

    const row = db
      .prepare("SELECT id, username, display_name, role, avatar_url FROM users WHERE id = ?")
      .get(userId) as { id: string; username: string; display_name: string; role: string; avatar_url: string | null };
    res.json({ user: userResponse(row) });
  });
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({ settings: adminSettingsPayload() });
});

const settingsSchema = z.object({
  livekitUrl: z
    .string()
    .trim()
    .min(1)
    .regex(/^wss?:\/\//i, "LiveKit URL 需以 ws:// 或 wss:// 开头")
    .optional(),
  livekitApiKey: z.string().trim().min(1).optional(),
  livekitApiSecret: z.string().trim().min(1).optional(),
  addEndpoint: z
    .object({
      label: z.string().trim().min(1).max(40),
      url: z
        .string()
        .trim()
        .regex(/^wss?:\/\//i, "LiveKit URL 需以 ws:// 或 wss:// 开头"),
    })
    .optional(),
  removeEndpointId: z.string().trim().min(1).optional(),
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "参数无效" });
  }

  const { addEndpoint, removeEndpointId, ...patch } = parsed.data;
  if (
    patch.livekitUrl === undefined &&
    patch.livekitApiKey === undefined &&
    patch.livekitApiSecret === undefined &&
    addEndpoint === undefined &&
    removeEndpointId === undefined
  ) {
    return res.status(400).json({ error: "没有可更新的字段" });
  }

  try {
    if (addEndpoint) addLivekitEndpoint(addEndpoint);
    if (removeEndpointId) removeLivekitEndpoint(removeEndpointId);
    if (
      patch.livekitUrl !== undefined ||
      patch.livekitApiKey !== undefined ||
      patch.livekitApiSecret !== undefined
    ) {
      updateServerSettings(patch);
    }
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "更新失败",
    });
  }

  const payload = adminSettingsPayload();
  let livekitControl = null as Awaited<ReturnType<typeof applyLivekitNodeSelection>> | null;

  // Saving an active LiveKit URL also starts that node and stops the other builtin
  if (patch.livekitUrl !== undefined) {
    livekitControl = await applyLivekitNodeSelection(payload.livekitUrl);
  }

  console.log(`[hez] Admin updated settings; LiveKit URL => ${payload.livekitUrl}`);
  res.json({ settings: payload, livekitControl });
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

app.get("/api/rooms/participants", requireAuth, async (_req, res) => {
  const rooms = db.prepare("SELECT code FROM rooms").all() as { code: string }[];
  const codes = rooms.map((r) => r.code);
  const counts = await getRoomParticipantCounts(codes);
  res.json({ counts });
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
    url: getLivekitUrl(),
    room: { id: room.id, code: room.code, name: room.name },
  });
});

async function boot() {
  seedSettingsFromEnv();
  await ensureAdminUser();

  if (DEMO_MODE) {
    await seedDemoDatabase(process.env.HEZ_DEMO_RESET === "1");
    console.log("[hez] DEMO MODE — fake SQLite seeded (alice/bob/carol · demo123)");
  }

  app.listen(PORT, () => {
    console.log(`[hez] API listening on http://localhost:${PORT}`);
    console.log(`[hez] LiveKit URL: ${getLivekitUrl()}`);
    if (DEMO_MODE) {
      console.log(`[hez] Demo DB: ${process.env.DATABASE_PATH || "./data/hez.db"}`);
    }
  });
}

void boot();
