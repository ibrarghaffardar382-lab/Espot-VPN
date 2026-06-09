import { eq } from "drizzle-orm";
import { db, sessions, users, proxies } from "../db/index.js";
import { effectiveBlocklist } from "../lib/blocklist.js";
import { clientCache, type ResolvedClient } from "./state.js";

/**
 * Parse a `Proxy-Authorization: Basic ...` header into username/password.
 * In this system the password IS the user's active session token.
 */
export function parseProxyAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !value) return null;
  const decoded = Buffer.from(value, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * Resolve proxy credentials to an active user + their assigned upstream proxy
 * + effective blocklist. Cached briefly so force-logout takes effect quickly.
 * Returns null when the credentials are invalid / the session is revoked.
 */
export async function resolveClient(
  username: string,
  token: string,
): Promise<ResolvedClient | null> {
  const cached = clientCache.get(token);
  if (cached !== undefined) {
    if (cached && cached.user.username === username) return cached;
    if (cached === null) return null;
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session || session.revokedAt) {
    clientCache.set(token, null);
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || user.username !== username || user.status !== "active") {
    clientCache.set(token, null);
    return null;
  }

  const [proxy] = user.proxyId
    ? await db.select().from(proxies).where(eq(proxies.id, user.proxyId))
    : [null];

  const blocked = await effectiveBlocklist(user);
  const resolved: ResolvedClient = {
    sessionId: session.id,
    user,
    proxy: proxy && proxy.status === "active" ? proxy : null,
    blocked,
  };
  clientCache.set(token, resolved);
  return resolved;
}
