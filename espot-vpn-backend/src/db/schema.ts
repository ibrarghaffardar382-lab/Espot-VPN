import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const proxyStatusEnum = pgEnum("proxy_status", ["active", "inactive"]);
export const proxyProtocolEnum = pgEnum("proxy_protocol", ["http", "https", "socks5"]);
export const blockScopeEnum = pgEnum("block_scope", ["global", "plan", "user"]);

// Subscription plans (limits that apply to the users assigned to them).
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  maxSessions: integer("max_sessions").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Upstream vendor proxies. One proxy can be assigned to many users.
export const proxies = pgTable("proxies", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  protocol: proxyProtocolEnum("protocol").notNull().default("http"),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  username: text("username"),
  password: text("password"),
  country: text("country").notNull().default(""),
  city: text("city").notNull().default(""),
  status: proxyStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// VPN end-users (the paying customers who install the extension).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  status: userStatusEnum("status").notNull().default("active"),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  proxyId: uuid("proxy_id").references(() => proxies.id, { onDelete: "set null" }),
  maxSessionsOverride: integer("max_sessions_override"),
  dataUsedBytes: bigint("data_used_bytes", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Active logged-in devices. The session token doubles as the proxy password.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  deviceName: text("device_name").notNull().default("Unknown device"),
  deviceId: text("device_id").notNull().default(""),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  bytesUp: bigint("bytes_up", { mode: "number" }).notNull().default(0),
  bytesDown: bigint("bytes_down", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// Website blocklist entries. scope=global applies to everyone; scope=plan/user
// applies to the plan/user referenced by refId.
export const blocklist = pgTable("blocklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  scope: blockScopeEnum("scope").notNull().default("global"),
  refId: uuid("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type Proxy = typeof proxies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BlockEntry = typeof blocklist.$inferSelect;
