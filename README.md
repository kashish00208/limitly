# limitly

> A standalone, persistent API rate-limiting service built from scratch using the Token Bucket algorithm.

limitly is a networked rate-limiting service that other applications can call to determine whether a request should be **allowed or denied**.

Unlike implementing rate limiting as middleware inside an application, limitly runs as an independent service. It focuses on the underlying engineering problems behind rate limiting: **concurrency, shared state, persistence, configurable limits, and correctness under load**.

## Why limitly?

Rate limiting is commonly implemented by importing a library or adding middleware to an existing API.

limitly takes a different approach: build the rate limiter itself as a standalone service.

This makes the project a practical exploration of:

* Token bucket algorithms
* Concurrent request handling
* Persistent state
* Race-condition prevention
* API design
* Rate-limit headers
* Load testing
* Distributed systems

## Features

### Core

* Token Bucket rate-limiting algorithm
* Per-client configurable limits
* Configurable requests-per-second rate
* Configurable burst capacity
* Persistent bucket state
* Concurrency-safe request handling
* Standard rate-limit response headers
* Admin API for configuring clients

### Multiple Algorithms

limitly supports:

* **Token Bucket**
* **Sliding Window**

The algorithm can be configured per client.

### Reliability

Rate-limit state survives service restarts instead of existing only in application memory.

Concurrent requests for the same client are handled safely so that tokens cannot be double-spent because of race conditions.

### Load Testing

The project includes load tests designed to verify rate-limiting correctness under **500+ requests per second**.

## How It Works

For the Token Bucket algorithm, each client has an associated bucket containing a number of tokens.

```text
                Request
                   │
                   ▼
            ┌─────────────┐
            │   limitly │
            └──────┬──────┘
                   │
             Identify client
                   │
                   ▼
            ┌─────────────┐
            │ Token Bucket│
            └──────┬──────┘
                   │
             ┌─────┴─────┐
             │           │
        Token available  No token
             │           │
             ▼           ▼
          ALLOW         DENY
```

Tokens are replenished according to the configured rate.

For example:

```text
Rate: 10 requests/second
Burst: 20 requests

Client can immediately consume up to 20 tokens,
then tokens are replenished at 10 tokens/second.
```

## API

### Check Rate Limit

```http
POST /v1/ratelimit/check
```

Example request:

```json
{
  "clientKey": "user_123"
}
```

Example allowed response:

```json
{
  "decision": "ALLOW",
  "remaining": 9,
  "reset": 1
}
```

Example denied response:

```json
{
  "decision": "DENY",
  "remaining": 0,
  "reset": 1
}
```

### Configure Client

```http
POST /v1/admin/clients
```

Example:

```json
{
  "clientKey": "user_123",
  "algorithm": "token-bucket",
  "requestsPerSecond": 10,
  "burstSize": 20
}
```

## Rate-Limit Headers

Responses include standard rate-limit information such as:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1
```

These allow consuming services to understand their current request allowance.

## Persistence

limitly persists rate-limit state so that restarting the service does not reset every client's bucket.

```text
Request
   │
   ▼
limitly
   │
   ├── Read client configuration
   │
   ├── Read bucket state
   │
   ├── Refill tokens
   │
   ├── Atomically consume token
   │
   └── Persist updated state
```

## Concurrency

A critical requirement of limitly is preventing two concurrent requests from consuming the same token.

For example, if a client has exactly one token:

```text
Request A ──┐
            ├──► limitly ──► 1 token ──► ALLOW
Request B ──┘                         └──► DENY
```

The state transition must be atomic for the same client key.

This prevents race conditions and incorrect request allowances under high concurrency.

