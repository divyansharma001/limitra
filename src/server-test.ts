import express from "express";
import Redis from "ioredis";
import { createRedisStore } from "./store/redis.js";
import { createSlidingWindow } from "./algorithms/sliding-window.js";
import { limitra } from "./middleware.js";

const app = express();
const port = 3000;


const redisClient = new Redis();
const redisStore = createRedisStore(redisClient);


const limiter = createSlidingWindow(redisStore, {
    points: 5,
    duration: 10
});

app.use(limitra({
    limiter: limiter,
    keyGenerator: (req) => req.ip || "127.0.0.1" 
}));

app.get("/", (req, res) => {
    res.send("Hello! You are within the rate limit.");
});

app.listen(port, () => {
    console.log(`Test server running at http://localhost:${port}`);
    console.log("Try refreshing the page quickly to trigger the limit.");
});