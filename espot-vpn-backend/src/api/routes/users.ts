import { Router } from "express";
import { z } from "zod";
import { eq, desc, isNull, and, count } from "drizzle-orm";
import { db, users, sessions, plans, proxies } from "../../db/index.js";
import { hashPassword } from "../../lib/password.js";

const router: Router = Router();

const createSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).regex(/^[a-zA-Z0-9_.-]+$/, "Username may use letters, numbers, . _ -"),
  password: z.string().min(6),
  status: z.enum(["active", "suspended"]).default("active"),
  planId: z.string().uuid().nullable().optional(),
  proxyId: z.string().uuid().nullable().optional(),
  maxSessionsOverride: z.number().int().min(1).nullable().optional(),
});

const updateSchema = createSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
});

function publicUser(u: typeof users.$inferSelect) {
  const { passwordHash, ...rest } = u;
  return rest;
}

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(users)
    .leftJoin(plans, eq(users.planId, plans.id))
    .leftJoin(proxies, eq(users.proxyId, proxies.id))
    .orderBy(desc(users.createdAt));
  const activeCounts = await db
    .select({ userId: sessions.userId, c: count() })
    .from(sessions)
    .where(isNull(sessions.revokedAt))
    .groupBy(sessions.userId);
  const activeMap = new Map(activeCounts.map((a) => [a.userId, Number(a.c)]));
  const result = rows.map((r) => ({
    ...publicUser(r.users),
    plan: r.plans ? { id: r.plans.id, name: r.plans.name, maxSessions: r.plans.maxSessions } : null,
    proxy: r.proxies ? { id: r.proxies.id, label: r.proxies.label, country: r.proxies.country } : null,
    activeSessions: activeMap.get(r.users.id) ?? 0,
  }));
  res.json(result);
});

router.get("/:id", async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.params.id));
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, u.id))
    .orderBy(desc(sessions.lastSeenAt));
  // Never expose the raw session token (it doubles as the proxy password).
  const safeSessions = userSessions.map(({ token: _token, ...rest }) => rest);
  res.json({ ...publicUser(u), sessions: safeSessions });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { password, ...rest } = parsed.data;
  try {
    const [row] = await db
      .insert(users)
      .values({ ...rest, passwordHash: await hashPassword(password) })
      .returning();
    res.status(201).json(publicUser(row));
  } catch {
    res.status(409).json({ error: "Email or username already in use" });
  }
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { password, ...rest } = parsed.data;
  const values: Record<string, unknown> = { ...rest };
  if (password) values.passwordHash = await hashPassword(password);
  const [row] = await db.update(users).set(values).where(eq(users.id, req.params.id)).returning();
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(publicUser(row));
});

router.delete("/:id", async (req, res) => {
  await db.delete(users).where(eq(users.id, req.params.id));
  res.status(204).end();
});

export default router;
