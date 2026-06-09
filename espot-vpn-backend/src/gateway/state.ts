import { TtlCache } from "../lib/cache.js";
import type { User, Proxy } from "../db/schema.js";

export interface ResolvedClient {
  sessionId: string;
  user: User;
  proxy: Proxy | null;
  blocked: string[];
}

// Short TTL so admin force-logout / block changes take effect within seconds.
export const clientCache = new TtlCache<ResolvedClient | null>(8000);

interface Closable {
  destroy(): void;
}

// Live sockets grouped by session, so a revoke can drop active tunnels instantly
// instead of waiting for the next connection to re-check auth.
const sessionSockets = new Map<string, Set<Closable>>();

export function registerSocket(sessionId: string, ...sockets: Closable[]): void {
  let set = sessionSockets.get(sessionId);
  if (!set) {
    set = new Set();
    sessionSockets.set(sessionId, set);
  }
  for (const s of sockets) set.add(s);
}

export function unregisterSocket(sessionId: string, ...sockets: Closable[]): void {
  const set = sessionSockets.get(sessionId);
  if (!set) return;
  for (const s of sockets) set.delete(s);
  if (set.size === 0) sessionSockets.delete(sessionId);
}

/** Forcibly tear down every live tunnel belonging to a session. */
export function killSession(sessionId: string): void {
  const set = sessionSockets.get(sessionId);
  if (!set) return;
  for (const s of set) {
    try {
      s.destroy();
    } catch {
      /* ignore */
    }
  }
  sessionSockets.delete(sessionId);
}

export function killAllSessions(): void {
  for (const id of [...sessionSockets.keys()]) killSession(id);
}

/** Drop a token from the gateway cache so the next connection re-checks the DB. */
export function invalidateToken(token: string): void {
  clientCache.delete(token);
}

/** Drop everything (used after bulk revokes / config changes). */
export function invalidateAll(): void {
  clientCache.clear();
}
