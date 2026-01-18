import express from "express";
import { Redis } from "ioredis";
import os from "os";
import { createRedisStore } from "./store/redis.js";
import { createMemoryStore } from "./store/memory.js";
import { createSlidingWindow } from "./algorithms/sliding-window.js";
import { createFixedWindow } from "./algorithms/fixed-window.js";
import { createAdaptiveLimiter } from "./adaptive.js";
import { limitra } from "./middleware.js";
import { measureEventLoopLag } from "./utils/health.js";

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

// 3. System Health Thresholds
const THRESHOLDS = {
    eventLoopLagMs: 50,      // Event loop lag > 50ms = overloaded
    memoryUsagePercent: 80,  // Memory > 80% = overloaded
    cpuLoadFactor: 0.8       // CPU load > 80% of available cores = overloaded
};

// 4. Create the Adaptive Limiter with real system health checks
const adaptiveLimiter = createAdaptiveLimiter({
    strategies: {
        "normal": normalLimiter,
        "panic": panicLimiter
    },
    selector: async () => {
        // Check Event Loop Lag
        const eventLoopLag = await measureEventLoopLag();
        
        // Check Memory Usage
        const memUsage = process.memoryUsage();
        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        // Check CPU Load
        const cpuLoad = os.loadavg()[0] ?? 0; // 1-minute average
        const numCpus = os.cpus().length;
        const cpuLoadPercent = (cpuLoad / numCpus) * 100;
        
        const isOverloaded =
            eventLoopLag > THRESHOLDS.eventLoopLagMs ||
            heapUsedPercent > THRESHOLDS.memoryUsagePercent ||
            cpuLoadPercent > THRESHOLDS.cpuLoadFactor * 100;
        
        if (isOverloaded) {
            console.log(
                `[PANIC] Event Loop: ${eventLoopLag}ms, Memory: ${heapUsedPercent.toFixed(1)}%, CPU: ${cpuLoadPercent.toFixed(1)}%`
            );
            return "panic";
        }
        
        console.log(
            `[NORMAL] Event Loop: ${eventLoopLag}ms, Memory: ${heapUsedPercent.toFixed(1)}%, CPU: ${cpuLoadPercent.toFixed(1)}%`
        );
        return "normal";
    }
});

// 5. Use Middleware
app.use(limitra({
    limiter: adaptiveLimiter
}));

// Endpoints
app.get("/", (req, res) => {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const cpuLoad = os.loadavg()[0] ?? 0;
    const numCpus = os.cpus().length;
    const cpuLoadPercent = (cpuLoad / numCpus) * 100;
    
    res.send(`
        <h2>Rate Limiter Health Status</h2>
        <p>Heap Usage: ${heapUsedPercent.toFixed(1)}% (Threshold: ${THRESHOLDS.memoryUsagePercent}%)</p>
        <p>CPU Load: ${cpuLoadPercent.toFixed(1)}% (Threshold: ${THRESHOLDS.cpuLoadFactor * 100}%)</p>
        <p>Event Loop Lag Threshold: ${THRESHOLDS.eventLoopLagMs}ms</p>
        <p>The selector automatically switches to PANIC mode when thresholds are exceeded.</p>
        <p><a href="/">Refresh</a> to see updated metrics.</p>
    `);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("1. Test normal limits (5 reqs/10s).");
    console.log("2. Go to /toggle-load to switch modes.");
    console.log("3. Test panic limits (2 reqs/10s) using Memory store.");
});