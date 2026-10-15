// Redis outage check: does the limiter still limit when Redis dies?
//
//   npx tsx bench/outage.ts
//
// Starts Redis in Docker (port 6390), serves an Express app with the adaptive limiter (Redis sliding
// window normally, memory fixed window as the fallback), sends requests for one user, kills Redis
// halfway, and keeps sending. The limit is 50 requests per 60 s per user, so a limiter that still
// works lets 50 through and answers 429 after that. A limiter that fails open lets everything through.
// The Redis client uses the benchmark's strict settings: no offline queue, 1 s command timeout.
import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import express from "express";
import { Redis } from "ioredis";
import {
    createAdaptiveLimiter,
    createFixedWindow,
    createMemoryStore,
    createRedisStore,
    createSlidingWindow,
    limitra,
    measureEventLoopLag,
} from "../src/index.js";

const PORT = 6390, LIMIT = 50, BEFORE = 20, AFTER = 120;
const sh = (cmd: string) => execSync(cmd, { stdio: "pipe" }).toString().trim();

sh("docker rm -f limitra-outage-redis >/dev/null 2>&1 || true");
sh(`docker run -d --name limitra-outage-redis -p ${PORT}:6379 redis:7-alpine`);
await new Promise((r) => setTimeout(r, 1500));

const redis = new Redis({ port: PORT, enableOfflineQueue: false, commandTimeout: 1000, maxRetriesPerRequest: 0, lazyConnect: false });
redis.on("error", () => {});   // ioredis reports the dead connection here; the limiter sees it as failed commands
await new Promise((r) => redis.once("ready", r));

const opts = { points: LIMIT, duration: 60 };
const limiter = createAdaptiveLimiter({
    strategies: {
        normal: createSlidingWindow(createRedisStore(redis), opts),
        panic: createFixedWindow(createMemoryStore(), opts),
    },
    selector: async () => ((await measureEventLoopLag()) > 50 ? "panic" : "normal"),
    ...(process.env.NO_FALLBACK ? {} : { fallback: "panic" }),
} as Parameters<typeof createAdaptiveLimiter>[0]);

const app = express();
app.use(limitra({ limiter, keyGenerator: () => "user-1" }));
app.get("/", (_req, res) => { res.send("ok"); });
const server = app.listen(0);
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

const counts = { before: new Map<number, number>(), after: new Map<number, number>() };
let slowest = 0;
const hit = async (phase: "before" | "after") => {
    const t = performance.now();
    const r = await fetch(url);
    slowest = Math.max(slowest, performance.now() - t);
    counts[phase].set(r.status, (counts[phase].get(r.status) ?? 0) + 1);
};

for (let i = 0; i < BEFORE; i++) await hit("before");
sh("docker kill limitra-outage-redis");
await new Promise((r) => setTimeout(r, 300));
for (let i = 0; i < AFTER; i++) await hit("after");

const fmt = (m: Map<number, number>) => [...m].sort().map(([s, n]) => `${n}x ${s}`).join(", ");
console.log(`limit ${LIMIT} per 60 s, one user, ${BEFORE} requests with Redis up, then Redis killed, then ${AFTER} more`);
console.log(`  Redis up:   ${fmt(counts.before)}`);
console.log(`  Redis dead: ${fmt(counts.after)}`);
const through = counts.after.get(200) ?? 0;
console.log(`  ${through > LIMIT ? "FAIL" : "PASS"}: with Redis dead, ${through} requests got through (a working limiter stops at ${LIMIT}, then answers 429)`);
console.log(`  slowest request: ${slowest.toFixed(1)} ms`);

server.close();
redis.disconnect();
sh("docker rm -f limitra-outage-redis >/dev/null 2>&1 || true");
process.exit(0);
