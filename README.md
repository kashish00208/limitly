# limitly

> A standalone, persistent rate-limiting service with token bucket and sliding-window algorithms, backed by Redis.

limitly is a networked service that other applications call to get an **ALLOW / DENY** decision for a client key. Instead of importing a library or adding middleware, rate limiting runs as its own service, which forces real handling of shared state, concurrency, persistence, and correctness under load.

## Features

- Token bucket and sliding-window modes, selectable per client
- Per-client limits (rate, burst) via an admin API
- Race-safe: each decision is one atomic Redis Lua script, so tokens can't be double-spent
- State persisted with Redis AOF, survives restarts
- Rate-limit headers on every response
- Time sourced from Redis `TIME`, so multiple app instances don't drift
- Load test verifying correctness under 500+ concurrent requests

## How It Works

```text
Request ──► limitly ──► Redis (Lua script, atomic per client)
                           │
                           ├─ read client config
                           ├─ refill tokens / prune window
                           ├─ consume if available
                           └─ persist state
                           │
                 ┌─────────┴─────────┐
              ALLOW (200)         DENY (429)
```

**Token bucket:** refills `rate` tokens/sec up to `burst`. A client can spend up to `burst` immediately, then is limited to `rate`.

**Sliding window:** allows `floor(rate)` requests per rolling 1s window. `burst` is ignored in this mode.

If a client has one token left, two concurrent requests resolve to one `ALLOW` and one `DENY`.

## Run

```bash
# Redis with persistence
docker run -d -p 6379:6379 -v rl-data:/data redis:7 \
  redis-server --appendonly yes --appendfsync everysec

# Service
npm install
export ADMIN_TOKEN=change-me
bun run src/index.ts   # or: npx tsx src/index.ts
```

Listens on `:8080`. `--appendfsync everysec` can lose up to ~1s of writes on a crash; use `always` for strict durability at a throughput cost.

## API

### Check rate limit

```http
POST /api-gateway
x-client-key: user_123
```

| Status | Body | Meaning |
|---|---|---|
| 200 | `{"decision":"ALLOW"}` | Allowed |
| 429 | `{"decision":"DENY"}` | Rate limited |
| 400 | `{"error":"..."}` | Missing `x-client-key` |
| 503 | `{"error":"..."}` | Redis unavailable |

### Configure client

```http
PUT /admin/clients/user_123
x-admin-token: <ADMIN_TOKEN>
Content-Type: application/json

{ "mode": "token_bucket", "rate": 10, "burst": 20 }
```

| Field | Values |
|---|---|
| `mode` | `token_bucket` \| `sliding_window` |
| `rate` | number > 0 (tokens/sec, or requests per 1s window) |
| `burst` | integer >= 1 (token bucket only) |

`GET /admin/clients/:key` returns the current config. Unconfigured clients default to token bucket, 2/s, burst 10.

## Rate-Limit Headers

Sent on every response:

```http
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1760000000
Retry-After: 1
```

- `X-RateLimit-Reset`: unix seconds when the allowance is fully restored (token bucket) or the window frees up (sliding window)
- `Retry-After`: seconds, only on 429

## Load Test

```bash
# Correctness: exactly `burst` of 1000 concurrent requests must be allowed
npx tsx loadtest/correctness.ts

# Throughput
npx autocannon -c 200 -d 15 -m POST -H x-client-key=load-1 http://localhost:8080/api-gateway
```

Under sustained load, allowed requests should track `rate × duration + burst` for the token bucket.

## Design Notes

- **Atomicity:** config read, refill, consume, and write happen in a single Lua script, so Redis serializes them per key.
- **Persistence:** bucket state lives in Redis; keys expire only after a bucket would be full again, so expiry loses no information.
- **Failure mode:** if Redis is down, the service returns 503 (fail-closed).