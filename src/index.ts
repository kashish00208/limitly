import express, { Request, Response } from "express";
import { rateLimiter } from "../helper/rateLimiter";
import { connectRedis } from "../helper/redis";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.send("Hello world");
});

app.post("/api-gateway", async (req: Request, res: Response) => {
    const clientKey = req.get("x-client-key")?.trim();

    if (!clientKey) {
        return res.status(400).json({ error: "x-client-key header is required" });
    }

    const decision = await rateLimiter(clientKey);
    const status = decision === "ALLOW" ? 200 : 429;

    return res.status(status).json({ decision });
});

async function startServer() {
    await connectRedis();
    app.listen(8080, () => {
        console.log("Service is running on Port 8080");
    });
}

startServer().catch((error: unknown) => {
    console.error("Failed to start service", error);
    process.exitCode = 1;
});