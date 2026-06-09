import { Router } from "express";
import { z } from "zod";
import { eq, and, isNull, count, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, users, sessions, plans, proxies } from "../../db/index.js";
import { verifyPassword } from "../../lib/password.js";
import { env } from "../../env.js";
import { invalidateToken, killSession } from "../../gateway/state.js";
import { effectiveBlocklist } from "../../lib/blocklist.js";

const router: Router = Router();

function gatewayConfig(user: { username: string }, token: string, proxy: typeof proxies.$inferSelect | null) {
  return {
    scheme: env.gatewayScheme,
    host: env.gatewayPublicHost,
    port: env.gatewayPort ?? env.port,
    // The browser authenticates to OUR gateway with these credentials.
    // The password IS the session token, which lets the gateway tie each
    // proxy connection to a revocable device session.
    username: user.username,
    password: token,
    // A human-readable exit location string (contract: string | null).
    location: proxy ? [proxy.city, proxy.country].filter(Boolean).join(", ") || null : null,
  };
}

/**
 * Build the full client login/refresh payload the extension expects:
 * { token, user: { username, planName }, gateway, blocklist }.
 */
async function clientPayload(
  user: typeof users.$inferSelect,
  token: string,
  proxy: typeof proxies.$inferSelect | null,
) {
  const planName = user.planId
    ? (await db.select({ name: plans.name }).from(plans).where(eq(plans.id, user.planId)))[0]?.name ?? null
    : null;
  const blocklist = await effectiveBlocklist(user);
  return {
    token,
    user: { username: user.username, planName },
    gateway: gatewayConfig(user, token, proxy),
    blocklist,
  };
}

async function sessionLimitFor(userId: string): Promise<number> {
  const [u] = await db
    .select({ override: users.maxSessionsOverride, planMax: plans.maxSessions })
    .from(users)
    .leftJoin(plans, eq(users.planId, plans.id))
    .where(eq(users.id, userId));
  return u?.override ?? u?.planMax ?? 3;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceName: z.string().default("Unknown device"),
  deviceId: z.string().default(""),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const { username, password, deviceName, deviceId } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  if (user.status !== "active") {
    res.status(403).json({ error: "Account suspended. Contact support." });
    return;
  }

  // If this device already has an active session, reuse it instead of stacking.
  if (deviceId) {
    const [existing] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)));
    if (existing) {
      const [proxy] = user.proxyId
        ? await db.select().from(proxies).where(eq(proxies.id, user.proxyId))
        : [null];
      res.json(await clientPayload(user, existing.token, proxy ?? null));
      return;
    }
  }

  const limit = await sessionLimitFor(user.id);
  const token = nanoid(40);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

  // Serialize concurrent logins for the same user with a transaction-scoped
  // advisory lock, so the count-then-insert can't race past the device limit.
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`);
    const [{ c }] = await tx
      .select({ c: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    if (Number(c) >= limit) return false;
    await tx.insert(sessions).values({
      userId: user.id,
      token,
      deviceName,
      deviceId,
      ip,
      userAgent: req.headers["user-agent"] ?? "",
    });
    return true;
  });

  if (!inserted) {
    res.status(409).json({ error: `Device limit reached (${limit}). Log out another device first.` });
    return;
  }

  const [proxy] = user.proxyId
    ? await db.select().from(proxies).where(eq(proxies.id, user.proxyId))
    : [null];
  res.json(await clientPayload(user, token, proxy ?? null));
});

function bearer(req: { headers: Record<string, unknown> }): string | null {
  const h = (req.headers["authorization"] as string) ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

router.post("/heartbeat", async (req, res) => {
  const token = bearer(req) ?? (req.body?.token as string | undefined);
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session || session.revokedAt) {
    res.status(401).json({ error: "Session revoked", revoked: true });
    return;
  }
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
  res.json({ ok: true });
});

router.get("/status", async (req, res) => {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session || session.revokedAt) {
    res.json({ active: false, revoked: true });
    return;
  }
  res.json({ active: true, revoked: false, lastSeenAt: session.lastSeenAt });
});

router.post("/logout", async (req, res) => {
  const token = bearer(req) ?? (req.body?.token as string | undefined);
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.token, token), isNull(sessions.revokedAt)))
    .returning();
  if (row) {
    invalidateToken(row.token);
    killSession(row.id);
  }
  res.json({ ok: true });
});

export default router;
