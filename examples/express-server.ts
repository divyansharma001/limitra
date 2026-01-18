import express from "express";
import Redis from "ioredis";
import { createRedisStore } from "../src/store/redis";
import { createSlidingWindow } from "../src/algorithms/sliding-window";
import { createFixedWindow } from "../src/algorithms/fixed-window";
import { createAdaptiveLimiter } from "../src/adaptive";
import { limitra } from "../src/middleware";
import { createMemoryStore } from "../src/store/memory";

const app = express();
const port = 3000;

// 1. Setup Stores
const redisClient = new Redis();
const redisStore = createRedisStore(redisClient);
const memoryStore = createMemoryStore();

// 2. Define Strategies
// Strategy A: Precise but expensive (Redis + Sliding Window)
const normalLimiter = createSlidingWindow(redisStore, { points: 5, duration: 10 });

// Strategy B: Fast and cheap (Memory + Fixed Window)
const panicLimiter = createFixedWindow(memoryStore, { points: 2, duration: 10 }); // Lower limit for panic mode!

// 3. Global variable to simulate System Load
let isSystemOverloaded = false;

// 4. Create the Adaptive Limiter
const adaptiveLimiter = createAdaptiveLimiter({
    strategies: {
        "normal": normalLimiter,
        "panic": panicLimiter
    },
    selector: () => {
        // In a real app, you might check: os.loadavg(), or Redis latency
        if (isSystemOverloaded) {
            console.log("Using PANIC strategy (Memory)");
            return "panic";
        }
        console.log("Using NORMAL strategy (Redis)");
        return "normal";
    }
});

// 5. Use Middleware
app.use(limitra({
    limiter: adaptiveLimiter
}));

// Endpoints
app.get("/", (req, res) => {
    res.send(`Current Mode: ${isSystemOverloaded ? "PANIC" : "NORMAL"}. Refresh to test.`);
});

// A hidden route to toggle the load manually for testing
app.get("/toggle-load", (req, res) => {
    isSystemOverloaded = !isSystemOverloaded;
    res.send(`System Load Toggled. Overloaded? ${isSystemOverloaded}`);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("1. Test normal limits (5 reqs/10s).");
    console.log("2. Go to /toggle-load to switch modes.");
    console.log("3. Test panic limits (2 reqs/10s) using Memory store.");
});