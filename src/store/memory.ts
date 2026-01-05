import type { Store, TokenBucketResult } from "../types";

interface WindowData {
    count: number;
    expiry: number;
}

interface TokenBucketData {
    tokens: number,
    lastUpdated: number
}

export const createMemoryStore = (): Store => {
    const map = new Map<string, WindowData>();
    const tokenMap = new Map<string, TokenBucketData>();

    const increment = async (key: string, windowSeconds: number) => {
        const now = Date.now();
        const windowMs = windowSeconds * 1000;

        let record = map.get(key);

        if (!record || now > record.expiry) {
            record = {
                count: 0,
                expiry: now + windowMs
            }
        }

        record.count++;

        map.set(key, record);

        return {
            count: record.count,
            resetTime: record.expiry
        }
    }

    const consumeTokenBucket = async(
        key: string,
        capacity: number,
        refillRate: number
    ): Promise<TokenBucketResult> =>{

        const now = Date.now();
        let record = tokenMap.get(key);

        if(!record){
            record = {tokens: capacity, lastUpdated: now}
        }

        const timePassedSeconds = (now - record.lastUpdated)/1000
        const tokensToAdd = timePassedSeconds * refillRate

        record.tokens = Math.min(capacity, record.tokens + tokensToAdd)
        record.lastUpdated = now;

        let blocked = false;
        if(record.tokens >=1){
            record.tokens -=1;
        } else{
            blocked = true;
        }
        tokenMap.set(key, record);

        return {
            blocked,
            tokensLeft: record.tokens
        };
    }

    return { increment , consumeTokenBucket };
}