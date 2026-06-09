import { Router } from "express";
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { db, proxies, users } from "../../db/index.js";
import { testProxy } from "../../lib/proxyTest.js";

const router: Router = Router();

const proxySchema = z.object({
  label: z.string().min(1),
  protocol: z.enum(["http", "https", "socks5"]).default("http"),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  country: z.string().default(""),
  city: z.string().default(""),
  status: z.enum(["active", "inactive"]).default("active"),
});

router.get("/", async (_req, res) => {
  const rows = await db.select().from(proxies).orderBy(proxies.createdAt);
  // attach assigned-user counts
  const counts = await db
    .select({ proxyId: users.proxyId, c: count() })
    .from(users)
    .groupBy(users.proxyId);
  const map = new Map(counts.map((c) => [c.proxyId, Number(c.c)]));
  res.json(rows.map((p) => ({ ...p, assignedUsers: map.get(p.id) ?? 0 })));
});

router.post("/", async (req, res) => {
  const parsed = proxySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const [row] = await db.insert(proxies).values(parsed.data).returning();
  res.status(201).json(row);
});

router.put("/:id", async (req, res) => {
  const parsed = proxySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .update(proxies)
    .set(parsed.data)
    .where(eq(proxies.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Proxy not found" });
    return;
  }
  res.json(row);
});

router.post("/:id/test", async (req, res) => {
  const [proxy] = await db.select().from(proxies).where(eq(proxies.id, req.params.id));
  if (!proxy) {
    res.status(404).json({ error: "Proxy not found" });
    return;
  }
  const result = await testProxy(proxy);
  res.json(result);
});

router.delete("/:id", async (req, res) => {
  await db.delete(proxies).where(eq(proxies.id, req.params.id));
  res.status(204).end();
});

export default router;
