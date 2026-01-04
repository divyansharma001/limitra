import redis from "ioredis";
import type {Store} from "../types";

export const createRedisStore = (redisClient: redis):Store =>{

    const increment = async(key:string, windowSeconds: number) =>{
        const multi = redisClient.multi();
        multi.incr(key);
        multi.ttl(key);

        const result = await multi.exec();

        //result format from ioredis is: [[err, count], [err,ttl]]

        const count = result?.[0]?.[1] as number;
        let ttl = result?.[1]?.[1] as number;

        if(ttl === -1){
            await redisClient.expire(key, windowSeconds);
            ttl = windowSeconds;
        }

        const resetTime = Date.now() + (ttl*1000);

        return {
            count,
            resetTime
        }
    }

    return {increment}
}