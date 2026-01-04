import type { RateLimitOptions, RateLimitResult, RateLimiter, Store } from "../types";

export const createFixedWindow = (store: Store, options: RateLimitOptions): RateLimiter =>{

    const consume = async(key: string): Promise<RateLimitResult> =>{
        const {count, resetTime} = await store.increment(key, options.duration);

        const blocked = count > options.points;
        const remaining = Math.max(0, options.points-count);

        return {
            blocked,
            limit: options.points,
            remaining,
            resetTime
        }
    }

    return {consume};
}