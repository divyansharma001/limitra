# Limitra Rate Limiter

A modular, adaptive rate limiting library for Node.js/Express with pluggable stores, multiple algorithms, and automatic health-based strategy switching.

## Highlights
- Algorithms: Sliding Window, Fixed Window, Token Bucket
- Stores: Redis (distributed), Memory (in-process)
- Adaptive selector: switches strategies based on system health (event loop lag, memory, CPU)
- Express middleware: drop-in `app.use(limitra({ limiter }))`
- TypeScript, strict mode, NodeNext modules

## Architecture
- **Core types**: shared contracts for stores and limiters (`src/types.ts`)
- **Stores**: Redis (`src/store/redis.ts`), Memory (`src/store/memory.ts`)
- **Algorithms**: Sliding Window (`src/algorithms/sliding-window.ts`), Fixed Window (`src/algorithms/fixed-window.ts`), Token Bucket (`src/algorithms/token-bucket.ts`)
- **Adaptive limiter**: strategy selector + map of concrete limiters (`src/adaptive.ts`)
- **Middleware**: Express adapter handling headers and responses (`src/middleware.ts`)
- **Health utils**: event loop lag probe (`src/utils/health.ts`)
- **Example**: Adaptive Express server (`src/server-test.ts`, `examples/express-server.ts`)

## Installation
```bash
npm install
```

## Building
```bash
npm run build
```
Outputs TypeScript declarations and compiled JS in `dist/`.

## Usage
Create a limiter and attach the middleware:
```ts
import express from "express";
import { Redis } from "ioredis";
import { createRedisStore, createSlidingWindow, limitra } from "limitra";

const app = express();
const redis = new Redis();
const store = createRedisStore(redis);
const limiter = createSlidingWindow(store, { points: 100, duration: 60 });

app.use(limitra({ limiter }));
app.get("/", (_req, res) => res.send("ok"));
app.listen(3000);
```

## Adaptive Mode (health-driven)
See `src/server-test.ts` for a working example. The selector checks:
- Event loop lag via `measureEventLoopLag()`
- Heap usage percent from `process.memoryUsage()`
- CPU load via `os.loadavg()` relative to core count

When thresholds are exceeded, it switches to a cheaper in-memory limiter; otherwise it uses the Redis-backed limiter.

## Express Middleware Behavior
- Calls `limiter.consume(key)` (default key: client IP)
- Sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Retry-After`
- On block: responds with 429 and configurable message/status
- On allow: calls `next()`

### Customization
- `keyGenerator(req)`: derive a key (e.g., user ID, API token)
- `message`: response body when blocked
- `statusCode`: HTTP status when blocked

## Algorithms
- **Sliding Window**: weighted previous window to smooth edges.
- **Fixed Window**: simple bucket reset per interval; fastest.
- **Token Bucket**: smooth consumption with refill rate; good for bursts.

## Stores
- **Redis store**: distributed counters for multi-instance deployments.
- **Memory store**: zero-dependency, in-process; ideal for panic/backup mode.

## Health Probing
- `measureEventLoopLag()`: measures lag using `setImmediate` scheduling.
- You can plug additional probes (e.g., Redis latency, custom SLOs) into the adaptive selector.

## Testing Locally
- Start Redis locally if using Redis-backed limiters.
- Run the sample server and hit it with `curl` or a load tool:
```bash
npm run build
node dist/server-test.js
```

## Package Entry Points
- Library re-exports live in `src/index.ts` and emit to `dist/` after build.

## License
MIT
