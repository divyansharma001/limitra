import Redis from "ioredis";
import { createFixedWindow } from "./algorithms/fixed-window";
import { createTokenBucket } from "./algorithms/token-bucket";
import { createMemoryStore } from "./store/memory";
import { createRedisStore } from "./store/redis";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const run = async () => {
    
    console.log("Testing Fixed Window");
    console.log("Testing Memory Store (Fixed Window)");
    const memoryStore = createMemoryStore();
    const memoryLimiter = createFixedWindow(memoryStore, { points: 2, duration: 10 });

    for (let i = 0; i < 3; i++) {
        const result = await memoryLimiter.consume("user_fw_mem");
        console.log(`Memory FW Request ${i}:`, result); // third req will be blocked
    }

    console.log("\nTesting Redis Store (Fixed Window)");
    const redisClient = new Redis();
    const redisStore = createRedisStore(redisClient);
    const redisLimiter = createFixedWindow(redisStore, { points: 2, duration: 10 });

    await redisClient.del("user_fw_redis");

    for (let i = 0; i < 3; i++) {
        const result = await redisLimiter.consume("user_fw_redis");
        console.log(`Redis FW Request ${i}:`, result); // third req will be blocked
    }


    console.log("\n--- Testing Token Bucket ---");
    // 5 tokens capacity, refills at a rate of 0.5 tokens/sec (5 points / 10s duration)
    const tbOptions = { points: 5, duration: 10 };

    // Test with Memory Store
    console.log("Testing Memory Store (Token Bucket)");
    const memoryTbLimiter = createTokenBucket(memoryStore, tbOptions);
    await testTokenBucket(memoryTbLimiter, "user_tb_mem");

    // Test with Redis Store
    console.log("\nTesting Redis Store (Token Bucket)");
    const redisTbLimiter = createTokenBucket(redisStore, tbOptions);
    await redisClient.del("user_tb_redis"); // Clean up before test
    await testTokenBucket(redisTbLimiter, "user_tb_redis");


    redisClient.disconnect();
}

async function testTokenBucket(limiter: any, key: string) {
    console.log(`Initial burst of 6 requests for key: ${key}`);
    for (let i = 0; i < 6; i++) {
        const result = await limiter.consume(key);
        // The 6th request should be blocked as capacity is 5
        console.log(`  Request ${i+1}:`, { blocked: result.blocked, remaining: result.remaining });
    }

    console.log("\nWaiting for 4 seconds to refill 2 tokens (0.5 tokens/sec * 4s)...");
    await sleep(4000);

    console.log("Attempting 3 more requests...");
    for (let i = 0; i < 3; i++) {
        const result = await limiter.consume(key);
        // First 2 should pass, 3rd should fail
        console.log(`  Request ${i + 7}:`, { blocked: result.blocked, remaining: result.remaining });
    }
}


run().catch(console.error);