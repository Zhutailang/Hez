import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "hez-dev-jwt-secret-change-me";

export type UserRole = "user" | "admin";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

export type AuthedRequest = Request & { user?: AuthUser };

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function normalizeRole(role: unknown): UserRole {
  return role === "admin" ? "admin" : "user";
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录" });
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as jwt.JwtPayload;
    req.user = {
      id: String(payload.sub),
      username: String(payload.username),
      displayName: String(payload.displayName),
      role: normalizeRole(payload.role),
    };
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

/** Admin gate — re-checks role from DB so demotions take effect without waiting for JWT expiry. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const row = db
      .prepare("SELECT role FROM users WHERE id = ?")
      .get(req.user!.id) as { role: string } | undefined;
    if (!row || row.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }
    req.user!.role = "admin";
    next();
  });
}
