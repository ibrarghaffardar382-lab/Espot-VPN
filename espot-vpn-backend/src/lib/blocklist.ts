import { db, blocklist } from "../db/index.js";
import { eq, or, and } from "drizzle-orm";
import type { User } from "../db/schema.js";

/** Returns the set of blocked domains that apply to a given user. */
export async function effectiveBlocklist(user: Pick<User, "id" | "planId">): Promise<string[]> {
  const rows = await db
    .select({ domain: blocklist.domain })
    .from(blocklist)
    .where(
      or(
        eq(blocklist.scope, "global"),
        user.planId ? and(eq(blocklist.scope, "plan"), eq(blocklist.refId, user.planId)) : undefined,
        and(eq(blocklist.scope, "user"), eq(blocklist.refId, user.id)),
      ),
    );
  return rows.map((r) => r.domain.toLowerCase().trim()).filter(Boolean);
}

/** True when `host` matches a blocked domain (exact or subdomain). */
export function isHostBlocked(host: string, blocked: string[]): boolean {
  const h = host.toLowerCase();
  return blocked.some((d) => h === d || h.endsWith("." + d));
}
