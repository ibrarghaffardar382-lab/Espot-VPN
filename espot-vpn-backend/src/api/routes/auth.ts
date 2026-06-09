import { Router } from "express";
import { z } from "zod";
import { env } from "../../env.js";
import { signAdminToken } from "../../lib/token.js";

const router: Router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const { username, password } = parsed.data;
  if (username !== env.adminUsername || password !== env.adminPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  res.json({ token: signAdminToken(username), username });
});

export default router;
