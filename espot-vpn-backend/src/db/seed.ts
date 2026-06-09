import { db, plans, proxies, users, blocklist } from "./index.js";
import { hashPassword } from "../lib/password.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

async function seed() {
  // Idempotent: skip if a demo user already exists.
  const existing = await db.select().from(users).where(eq(users.email, "demo@espot.vpn")).limit(1);
  if (existing.length > 0) {
    logger.info("Seed data already present, skipping.");
    return;
  }

  const [basicPlan] = await db
    .insert(plans)
    .values({
      name: "Basic",
      description: "Up to 2 devices",
      priceMonthlyCents: 499,
      maxSessions: 2,
    })
    .returning();

  const [proPlan] = await db
    .insert(plans)
    .values({
      name: "Pro",
      description: "Up to 5 devices",
      priceMonthlyCents: 999,
      maxSessions: 5,
    })
    .returning();

  const [demoProxy] = await db
    .insert(proxies)
    .values({
      label: "Demo US Proxy",
      protocol: "http",
      host: "proxy.example.com",
      port: 8080,
      username: "vendoruser",
      password: "vendorpass",
      country: "United States",
      city: "New York",
      status: "active",
    })
    .returning();

  await db.insert(users).values({
    email: "demo@espot.vpn",
    username: "demo",
    passwordHash: await hashPassword("demo1234"),
    status: "active",
    planId: proPlan.id,
    proxyId: demoProxy.id,
  });

  await db.insert(blocklist).values([
    { domain: "malware.example", scope: "global" },
    { domain: "ads.example", scope: "plan", refId: basicPlan.id },
  ]);

  logger.info("Seed complete. Demo VPN user: demo / demo1234");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(err, "Seed failed");
    process.exit(1);
  });
