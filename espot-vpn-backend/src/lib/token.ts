import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AdminTokenPayload {
  sub: string;
  role: "admin";
}

export function signAdminToken(username: string): string {
  const payload: AdminTokenPayload = { sub: username, role: "admin" };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AdminTokenPayload;
    if (decoded.role !== "admin") return null;
    return decoded;
  } catch {
    return null;
  }
}
