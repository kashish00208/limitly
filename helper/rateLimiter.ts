import { randomUUID } from "node:crypto";
import { client } from "./redis";

export type Mode = "token_bucket" | "sliding_window";
export interface ClientConfig { mode: Mode; rate: number; burst: number }

export const DEFAULT_CONFIG: ClientConfig = { mode: "token_bucket", rate: 2, burst: 10 };

export interface Decision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterMs: number;
}

const script = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)

local cfg = redis.call('HMGET', KEYS[1], 'mode', 'rate', 'burst')
local mode  = cfg[1] or ARGV[1]
local rate  = tonumber(cfg[2] or ARGV[2])
local burst = tonumber(cfg[3] or ARGV[3])
local stateKey = KEYS[2] .. ':' .. mode

if mode == 'token_bucket' then
  local d = redis.call('HMGET', stateKey, 'tokens', 'ts')
  local tokens = tonumber(d[1]) or burst
  local ts = tonumber(d[2]) or now
  tokens = math.min(burst, tokens + math.max(0, now - ts) / 1000 * rate)

  local allowed = 0
  if tokens >= 1 then tokens = tokens - 1; allowed = 1 end

  redis.call('HSET', stateKey, 'tokens', tokens, 'ts', now)
  -- a bucket idle this long is full anyway, so expiry loses nothing
  redis.call('PEXPIRE', stateKey, math.ceil(burst / rate * 1000) + 1000)

  local resetMs = math.ceil((burst - tokens) / rate * 1000)
  local retryMs = 0
  if allowed == 0 then retryMs = math.ceil((1 - tokens) / rate * 1000) end
  return { allowed, burst, math.floor(tokens), resetMs, retryMs }
end

-- sliding window log: limit = floor(rate) requests per 1s
local limit = math.max(1, math.floor(rate))
local windowMs = 1000
redis.call('ZREMRANGEBYSCORE', stateKey, 0, now - windowMs)
local count = redis.call('ZCARD', stateKey)

local allowed = 0
if count < limit then
  redis.call('ZADD', stateKey, now, ARGV[4])
  allowed = 1
  count = count + 1
end
redis.call('PEXPIRE', stateKey, windowMs)

local first = redis.call('ZRANGE', stateKey, 0, 0, 'WITHSCORES')
local resetMs = windowMs
if first[2] then resetMs = tonumber(first[2]) + windowMs - now end
local retryMs = 0
if allowed == 0 then retryMs = resetMs end
return { allowed, limit, limit - count, resetMs, retryMs }
`;

export async function rateLimiter(clientKey: string): Promise<Decision> {
  const r = (await client.eval(script, {
    keys: [`rl:config:${clientKey}`, `rl:state:${clientKey}`],
    arguments: [
      DEFAULT_CONFIG.mode,
      String(DEFAULT_CONFIG.rate),
      String(DEFAULT_CONFIG.burst),
      randomUUID(), 
    ],
  })) as number[];

  return {
    allowed: r[0] === 1,
    limit: r[1],
    remaining: Math.max(0, r[2]),
    resetMs: r[3],
    retryAfterMs: r[4],
  };
}

export async function setClientConfig(clientKey: string, cfg: ClientConfig) {
  await client.hSet(`rl:config:${clientKey}`, {
    mode: cfg.mode,
    rate: String(cfg.rate),
    burst: String(cfg.burst),
  });
}

export async function getClientConfig(clientKey: string): Promise<ClientConfig> {
  const h = await client.hGetAll(`rl:config:${clientKey}`);
  if (!h.mode) return DEFAULT_CONFIG;
  return { mode: h.mode as Mode, rate: Number(h.rate), burst: Number(h.burst) };
}