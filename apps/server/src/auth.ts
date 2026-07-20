import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "hez-dev-jwt-secret-change-me";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
};

export type AuthedRequest = Request & { user?: AuthUser };

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
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
    };
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}
