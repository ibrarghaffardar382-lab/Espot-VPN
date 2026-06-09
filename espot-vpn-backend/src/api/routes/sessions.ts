import { Router } from "express";
import { eq, desc, isNull, and } from "drizzle-orm";
import { db, sessions, users } from "../../db/index.js";
import { invalidateToken, invalidateAll, killSession, killAllSessions } from "../../gateway/state.js";

const router: Router = Router();

router.get("/", async (req, res) => {
  const activeOnly = req.query.active === "true";
  const rows = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(activeOnly ? isNull(sessions.revokedAt) : undefined)
    .orderBy(desc(sessions.lastSeenAt));
  res.json(
    rows.map((r) => ({
      ...r.sessions,
      token: undefined,
      user: { id: r.users.id, username: r.users.username, email: r.users.email },
    })),
  );
});

router.post("/:id/revoke", async (req, res) => {
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, req.params.id), isNull(sessions.revokedAt)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Active session not found" });
    return;
  }
  invalidateToken(row.token);
  killSession(row.id);
  res.json({ ok: true });
});

router.post("/user/:userId/revoke-all", async (req, res) => {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, req.params.userId), isNull(sessions.revokedAt)))
    .returning();
  revoked.forEach((s) => {
    invalidateToken(s.token);
    killSession(s.id);
  });
  res.json({ ok: true, count: revoked.length });
});

router.post("/revoke-all", async (_req, res) => {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(isNull(sessions.revokedAt))
    .returning();
  invalidateAll();
  killAllSessions();
  res.json({ ok: true, count: revoked.length });
});

export default router;
