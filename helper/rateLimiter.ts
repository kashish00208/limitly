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

const fixedWindowScript = `
local key = KEYS[1]
local max_requests = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]

local window_start = now - window_seconds * 1000

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

local count = redis.call('ZCARD', key)

if count < max_requests then
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, window_seconds)
  return { 1, max_requests - count - 1, 0 }
end

-- Denied: find oldest entry to compute retry-after (in ms)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry_after_ms = window_seconds * 1000
if #oldest >= 2 then
  retry_after_ms = oldest[2] + window_seconds * 1000 - now
end

return { 0, 0, retry_after_ms }
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
