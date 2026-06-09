import type { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "../../lib/token.js";

export interface AuthedRequest extends Request {
  admin?: string;
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.admin = payload.sub;
  next();
}
