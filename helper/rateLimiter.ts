import { Request, Response, NextFunction } from "express";
import { client } from "../helper/redis";

const CAPACITY = 10;
const REFIL_RATE = 2;

const tockenBucketScript = `
local capacity = tonumber(ARGV[1])
local refilRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET","KEYS[1]","tokens","lastrefil)

local tokens = tonumber(data[1])
local lastRefill = tonumber[data[2]]

if tokens == nil then 
    tokens = capacity
    lastrefill = now
end 

local elasped = (now - lastRefill)/1000
local newTokens = elasped * refilRate 

tokens = math.min(capacity,tokens+newTokens)

local allowed = 0 

if tokens >= 1 then 
    tokens = tokens - 1
    allowed = 1
end 

redis.call(
    "HSET",
    "KEYS[1]",
    "tokens","tokens",
    "lastRefill",now
)

redis.call("EXPIRE",KEYS[1],60)

return {allowed,tokens}

`;

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const clientIP = req.ip || "Unknown";

  const key = `rate-limit:${clientIP}`;

  const now = Date.now();

  const result = await client.eval(tockenBucketScript, {
    keys: [key],
    arguments: [CAPACITY.toString(), REFIL_RATE.toString(), now.toString()],
  });

  const [allowed, tokens] = result as [number, number];

  if (allowed === 1) {
    next();
    return;
  }

  res.status(429).json({
    message: "Too many requests",
    retryAfter: 1,
  });
}
