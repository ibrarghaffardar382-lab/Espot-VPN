import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { requireAdmin } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import proxiesRouter from "./routes/proxies.js";
import plansRouter from "./routes/plans.js";
import sessionsRouter from "./routes/sessions.js";
import blocklistsRouter from "./routes/blocklists.js";
import dashboardRouter from "./routes/dashboard.js";
import clientRouter from "./routes/client.js";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

  // Extension/client endpoints — authenticate with VPN user credentials.
  app.use("/api/client", clientRouter);

  // Admin auth (login is public; everything else requires a token).
  app.use("/api/admin/auth", authRouter);
  app.use("/api/admin/users", requireAdmin, usersRouter);
  app.use("/api/admin/proxies", requireAdmin, proxiesRouter);
  app.use("/api/admin/plans", requireAdmin, plansRouter);
  app.use("/api/admin/sessions", requireAdmin, sessionsRouter);
  app.use("/api/admin/blocklist", requireAdmin, blocklistsRouter);
  app.use("/api/admin/dashboard", requireAdmin, dashboardRouter);

  // Serve the built admin portal (SPA) in production.
  const publicDir = path.resolve(import.meta.dirname, "../../dist/public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  return app;
}
