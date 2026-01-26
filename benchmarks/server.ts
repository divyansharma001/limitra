import express from "express";
import Redis from "ioredis";
import { rateLimit } from "express-rate-limit";
import { RedisStore as ERLRedisStore } from "rate-limit-redis";
import { RateLimiterRedis } from "rate-limiter-flexible";

// Import local Limitra source
import { createRedisStore } from "../src/store/redis.js";
import { createMemoryStore } from "../src/store/memory.js"; // New
import { createSlidingWindow } from "../src/algorithms/sliding-window.js";
import { createFixedWindow } from "../src/algorithms/fixed-window.js"; // New
import { createAdaptiveLimiter } from "../src/adaptive.js"; // New
import { limitra } from "../src/middleware.js";

const app = express();
const port = 3000;
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const libType = process.env.LIB_TYPE || "limitra";

// Reduced timeouts so RLF/ERL fail faster (making the graph clearer)
const redisClient = new Redis(redisUrl, { 
    enableOfflineQueue: false,
    commandTimeout: 1000, // 1 second timeout
    connectTimeout: 1000
});

console.log(`>>> STARTING CHAOS SERVER: [ ${libType.toUpperCase()} ] <<<`);

const LIMIT_POINTS = 100;
const LIMIT_DURATION = 60;

// --- CHAOS SWITCH ---
// A global flag to simulate that "The system thinks Redis is bad"
let isRedisUnhealthy = false;

redisClient.on('error', (err) => {
    // console.error("Redis Error:", err.message);
    isRedisUnhealthy = true;
});

redisClient.on('ready', () => {
    isRedisUnhealthy = false;
});

if (libType === "limitra") {
  const redisStore = createRedisStore(redisClient);
  const memoryStore = createMemoryStore();

  // 1. Normal: Redis
  const normalStrategy = createSlidingWindow(redisStore, { 
    points: LIMIT_POINTS, 
    duration: LIMIT_DURATION 
  });

  // 2. Panic: Memory
  const panicStrategy = createFixedWindow(memoryStore, { 
    points: LIMIT_POINTS, // Keeping same limit for fairness
    duration: LIMIT_DURATION 
  });

  // 3. The Brain
  const limiter = createAdaptiveLimiter({
    strategies: {
      normal: normalStrategy,
      panic: panicStrategy
    },
    selector: async () => {
        // If our Chaos endpoint was hit, OR Redis client reports issues
        if (isRedisUnhealthy || redisClient.status !== 'ready') {
            return "panic";
        }
        return "normal";
    }
  });

  app.use(limitra({ limiter }));
} 
else if (libType === "erl") {
  app.use(rateLimit({
    windowMs: LIMIT_DURATION * 1000,
    limit: LIMIT_POINTS,
    store: new ERLRedisStore({
      sendCommand: (...args: string[]) => redisClient.call(...args),
    }),
  }));
} 
else if (libType === "rlf") {
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: LIMIT_POINTS,
    duration: LIMIT_DURATION,
    insuranceLimiter: null, // Ensure it doesn't use its own memory fallback (fair fight)
  });

  app.use((req, res, next) => {
    rateLimiter.consume(req.ip || "127.0.0.1")
      .then(() => next())
      .catch((rej) => {
        // RLF throws on error too. Differentiate block vs error
        if (rej instanceof Error) {
            // Redis Error
            next(); // Fail open? Or crash? Let's just 500.
        } else {
            res.status(429).send("Too Many Requests");
        }
      });
  });
}

// --- ENDPOINTS ---

app.get("/", (req, res) => {
  res.send("OK");
});

// THE KILL SWITCH
// This endpoint forcibly disconnects Redis.
app.post("/simulate-outage", async (req, res) => {
    console.log("!!! CHAOS TRIGGERED: DISCONNECTING REDIS !!!");
    isRedisUnhealthy = true;
    try {
        await redisClient.quit(); // Graceful close (or .disconnect() for force)
    } catch(e) {}
    res.send("Redis Killed");
});

// RECOVERY SWITCH
app.post("/recover", async (req, res) => {
    console.log("... Recovering Redis ...");
    await redisClient.connect();
    isRedisUnhealthy = false;
    res.send("Redis Restored");
});

app.listen(port, () => {
  console.log(`Server listening on ${port} (Mode: ${libType})`);
});