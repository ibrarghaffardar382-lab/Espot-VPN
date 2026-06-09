import { Router } from "express";
import { count, isNull, eq, sum, desc } from "drizzle-orm";
import { db, users, proxies, sessions, plans } from "../../db/index.js";

const router: Router = Router();

router.get("/summary", async (_req, res) => {
  const [[userCount], [activeUserCount], [proxyCount], [activeSessionCount], [planCount], [usage]] =
    await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(users).where(eq(users.status, "active")),
      db.select({ c: count() }).from(proxies),
      db.select({ c: count() }).from(sessions).where(isNull(sessions.revokedAt)),
      db.select({ c: count() }).from(plans),
      db.select({ total: sum(users.dataUsedBytes) }).from(users),
    ]);

  const recentSessions = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(8);

  res.json({
    totalUsers: Number(userCount.c),
    activeUsers: Number(activeUserCount.c),
    totalProxies: Number(proxyCount.c),
    activeSessions: Number(activeSessionCount.c),
    totalPlans: Number(planCount.c),
    totalDataBytes: Number(usage.total ?? 0),
    recentSessions: recentSessions.map((r) => ({
      id: r.sessions.id,
      deviceName: r.sessions.deviceName,
      ip: r.sessions.ip,
      lastSeenAt: r.sessions.lastSeenAt,
      revokedAt: r.sessions.revokedAt,
      username: r.users.username,
    })),
  });
});

export default router;
