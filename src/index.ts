import Redis from "ioredis";
import { createFixedWindow } from "./algorithms/fixed-window";
import { createMemoryStore } from "./store/memory";
import { createRedisStore } from "./store/redis";

const run = async()=>{
    console.log("Testing Memory Store")
    const memoryStore = createMemoryStore();
    const memoryLimiter = createFixedWindow(memoryStore, {points: 2, duration: 10});

    for(let i=0;i<3;i++){
        console.log(`Memory ${i} ${await memoryLimiter.consume("user_1")}`);  //third req will be blocked
    }

    console.log("Testing Redis Store")
    const redisClient = new Redis();
    const redisStore = createRedisStore(redisClient);
    const redisLimiter = createFixedWindow(redisStore, {points: 2, duration: 10});

    await redisClient.del("user_1");

    for(let i=0;i<3;i++){
        console.log(`Redis ${i} ${await redisLimiter.consume("user_1")}`);  //third req will be blocked
    }

    redisClient.disconnect();


}

run().catch(console.error);