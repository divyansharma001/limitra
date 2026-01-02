import type {RateLimitOptions, RateLimitResult, RateLimiter} from "../types";

type WindowData ={
    count: number;
    startTime: number;
}

export const createFixedWindow = (options: RateLimitOptions): RateLimiter=>{
    const storage = new Map<String, WindowData>();

    const consume = async (key: string): Promise<RateLimitResult>=>{
        const currentTime = Date.now();
        const windowDuration = options.duration * 1000;

        let record = storage.get(key);

        if(!record || (currentTime - record.startTime) >= windowDuration){
            record = {count: 0, startTime: currentTime};
        }

        record.count += 1;
        storage.set(key, record);

        const blocked = record.count > options.points;
        const resetTime = record.startTime + windowDuration;

        return {
            blocked,
            limit: options.points,
            remaining: Math.max(0, options.points - record.count),
            resetTime
        }
    };

        return {
            consume
        };
}