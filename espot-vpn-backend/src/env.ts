import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 5000),
  adminUsername: required("ADMIN_USERNAME", "admin"),
  adminPassword: required("ADMIN_PASSWORD", "change-me-please"),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret-change-me"),
  gatewayPort: process.env.GATEWAY_PORT ? Number(process.env.GATEWAY_PORT) : null,
  gatewayPublicHost: process.env.GATEWAY_PUBLIC_HOST ?? "localhost",
  gatewayScheme: (process.env.GATEWAY_SCHEME ?? "http") as "http" | "https",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
