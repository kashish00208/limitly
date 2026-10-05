import express, { Request, Response } from "express";
import { rateLimiter, setClientConfig, getClientConfig, ClientConfig } from "../helper/rateLimiter";
import { connectRedis } from "../helper/redis";

const app = express();
app.use(express.json());

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin-token";

app.post("/api-gateway", async (req: Request, res: Response) => {
  const clientKey = req.get("x-client-key")?.trim();
  if (!clientKey) return res.status(400).json({ error: "x-client-key header is required" });

  try {
    const d = await rateLimiter(clientKey);
    res.set({
      "X-RateLimit-Limit": String(d.limit),
      "X-RateLimit-Remaining": String(d.remaining),
      "X-RateLimit-Reset": String(Math.ceil((Date.now() + d.resetMs) / 1000)), // unix seconds
    });
    if (!d.allowed) res.set("Retry-After", String(Math.ceil(d.retryAfterMs / 1000)));

    return res.status(d.allowed ? 200 : 429).json({ decision: d.allowed ? "ALLOW" : "DENY" });
  } catch (err) {
    console.error("limiter failure", err);
    return res.status(503).json({ error: "rate limiter unavailable" });
  }
});

function validate(b: any): ClientConfig | string {
  if (b?.mode !== "token_bucket" && b?.mode !== "sliding_window") return "mode must be token_bucket|sliding_window";
  if (!(typeof b.rate === "number" && b.rate > 0)) return "rate must be a number > 0";
  if (!(Number.isInteger(b.burst) && b.burst >= 1)) return "burst must be an integer >= 1";
  return { mode: b.mode, rate: b.rate, burst: b.burst };
}

app.use("/admin", (req, res, next) =>
  req.get("x-admin-token") === ADMIN_TOKEN ? next() : res.status(401).json({ error: "unauthorized" }));

app.put("/admin/clients/:key", async (req, res) => {
  const cfg = validate(req.body);
  if (typeof cfg === "string") return res.status(400).json({ error: cfg });
  await setClientConfig(req.params.key, cfg);
  res.json({ key: req.params.key, ...cfg });
});

app.get("/admin/clients/:key", async (req, res) => {
  res.json({ key: req.params.key, ...(await getClientConfig(req.params.key)) });
});

async function startServer() {
  await connectRedis();
  app.listen(8080, () => console.log("Service is running on Port 8080"));
}
startServer().catch((e) => { console.error("Failed to start service", e); process.exitCode = 1; });