import type { RateLimitOptions, RateLimitResult, RateLimiter, Store } from "../types.js";

export const createSlidingWindow = (store: Store, options: RateLimitOptions): RateLimiter => {
    
    const consume = async (key: string): Promise<RateLimitResult> => {
        const now = Date.now();
        const windowSizeMs = options.duration * 1000;

    
        const currentWindowKeyTimestamp = Math.floor(now / windowSizeMs) * windowSizeMs;
        const previousWindowKeyTimestamp = currentWindowKeyTimestamp - windowSizeMs;

        const currentKey = `${key}:${currentWindowKeyTimestamp}`;
        const previousKey = `${key}:${previousWindowKeyTimestamp}`;

      
        const { count: currentCount, resetTime } = await store.increment(currentKey, options.duration * 2); 
     
        const previousCount = await store.get(previousKey);

      
        const timePassedInWindow = now - currentWindowKeyTimestamp;
        const weight = timePassedInWindow / windowSizeMs;
        
       
        const hitCount = Math.floor((previousCount * (1 - weight)) + currentCount);

        const blocked = hitCount > options.points;
        const remaining = Math.max(0, options.points - hitCount);

        return {
            blocked,
            limit: options.points,
            remaining,
            resetTime 
        };
    }

    return { consume };
}