import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, blocklist } from "../../db/index.js";
import { invalidateAll } from "../../gateway/state.js";

const router: Router = Router();

const entrySchema = z.object({
  domain: z
    .string()
    .min(1)
    .transform((d) => d.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")),
  scope: z.enum(["global", "plan", "user"]).default("global"),
  refId: z.string().uuid().nullable().optional(),
});

router.get("/", async (req, res) => {
  const scope = req.query.scope as string | undefined;
  const refId = req.query.refId as string | undefined;
  const rows = await db.select().from(blocklist).orderBy(blocklist.domain);
  const filtered = rows.filter(
    (r) => (!scope || r.scope === scope) && (!refId || r.refId === refId),
  );
  res.json(filtered);
});

router.post("/", async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  if (parsed.data.scope !== "global" && !parsed.data.refId) {
    res.status(400).json({ error: "refId is required for plan/user scoped blocks" });
    return;
  }
  const [row] = await db.insert(blocklist).values(parsed.data).returning();
  invalidateAll();
  res.status(201).json(row);
});

router.delete("/:id", async (req, res) => {
  await db.delete(blocklist).where(eq(blocklist.id, req.params.id));
  invalidateAll();
  res.status(204).end();
});

export default router;
