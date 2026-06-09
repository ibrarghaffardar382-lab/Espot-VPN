import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, plans } from "../../db/index.js";

const router: Router = Router();

const planSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  priceMonthlyCents: z.number().int().min(0).default(0),
  maxSessions: z.number().int().min(1).default(3),
});

router.get("/", async (_req, res) => {
  const rows = await db.select().from(plans).orderBy(plans.createdAt);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const [row] = await db.insert(plans).values(parsed.data).returning();
  res.status(201).json(row);
});

router.put("/:id", async (req, res) => {
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .update(plans)
    .set(parsed.data)
    .where(eq(plans.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  await db.delete(plans).where(eq(plans.id, req.params.id));
  res.status(204).end();
});

export default router;
