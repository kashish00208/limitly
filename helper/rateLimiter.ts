import { client } from "../helper/redis";

const CAPACITY = 10;
const REFILL_RATE = 2;

const tokenBucketScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "lastRefill")
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])

if tokens == nil then
    tokens = capacity
end
if lastRefill == nil then
    lastRefill = now
end

local elapsed = math.max(0, now - lastRefill) / 1000
tokens = math.min(capacity, tokens + elapsed * refillRate)

local allowed = 0
if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
end

redis.call("HSET", key, "tokens", tokens, "lastRefill", now)
redis.call("EXPIRE", key, 60)

return allowed
`;

export async function rateLimiter(clientKey: string): Promise<"ALLOW" | "DENY"> {
  const key = `rate-limit:${clientKey}`;
  const now = Date.now();

  const result = await client.eval(tokenBucketScript, {
    keys: [key],
    arguments: [CAPACITY.toString(), REFILL_RATE.toString(), now.toString()],
  });

  return Number(result) === 1 ? "ALLOW" : "DENY";
}
