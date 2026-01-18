import type { Redis } from "ioredis";
import type { Store, TokenBucketResult } from "../types";

//lua script for atomic token bucket operation

const consumeTokenBucketLua = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now_ms = tonumber(ARGV[3])

    local bucket_data = redis.call('HGETALL', key)

    local tokens
    local last_updated_ms

    if #bucket_data == 0 then
        -- First request for this key, initialize the bucket.
        tokens = capacity
        last_updated_ms = now_ms
    else
        -- Bucket exists, parse the key-value pairs from HGETALL result.
        local bucket = {}
        for i = 1, #bucket_data, 2 do
            bucket[bucket_data[i]] = bucket_data[i+1]
        end
        last_updated_ms = tonumber(bucket['lastUpdated'])
        local last_tokens = tonumber(bucket['tokens'])

        -- Refill tokens based on time passed.
        local time_passed_seconds = (now_ms - last_updated_ms) / 1000
        if time_passed_seconds > 0 then
            local tokens_to_add = time_passed_seconds * refill_rate
            tokens = math.min(capacity, last_tokens + tokens_to_add)
        else
            tokens = last_tokens
        end
    end

    local blocked = 0 -- 0 for false, 1 for true
    if tokens >= 1 then
        tokens = tokens - 1
    else
        blocked = 1
    end

    -- Update the bucket's state in Redis using a Hash.
    redis.call('HSET', key, 'tokens', tokens, 'lastUpdated', now_ms)
    
    -- Set a reasonable expiry on the key to prevent memory leaks for inactive users.
    -- The time to fully refill an empty bucket is a good TTL.
    local ttl_seconds = math.ceil(capacity / refill_rate)
    redis.call('EXPIRE', key, ttl_seconds)

    -- Return whether the request is blocked and the number of tokens left.
    return {blocked, tokens}
`;

export const createRedisStore = (redisClient: Redis): Store =>{

     if (!(redisClient as any).consumeTokenBucket) {
        redisClient.defineCommand("consumeTokenBucket", {
            numberOfKeys: 1,
            lua: consumeTokenBucketLua,
        });
    }

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

    const get = async(key: string)=>{
        const result = await redisClient.get(key);
        return result ? parseInt(result, 10) :0;
    }

    const consumeTokenBucket = async (
        key: string,
        capacity: number,
        refillRate: number
    ): Promise<TokenBucketResult> => {
        const now = Date.now();

        const result = await (redisClient as any).consumeTokenBucket(
            key,
            capacity,
            refillRate,
            now
        );
        
        const [blocked, tokensLeft] = result as [number, string];

        return {
            blocked: blocked === 1,
            tokensLeft: parseFloat(tokensLeft),
        };
    };

    return { increment, get, consumeTokenBucket }
}