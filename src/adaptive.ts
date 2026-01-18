import type { RateLimiter, RateLimitResult } from "./types.js";


type StrategySelector = (key: string) => Promise<string> | string;

interface AdaptiveOptions {
    strategies: Record<string, RateLimiter>;
    selector: StrategySelector;
}

export const createAdaptiveLimiter = (options: AdaptiveOptions): RateLimiter => {
    const consume = async (key: string): Promise<RateLimitResult> => {
        const strategyName = await options.selector(key);
        const limiter = options.strategies[strategyName];
        
        if (!limiter) {
            throw new Error(`Strategy '${strategyName}' not found in adaptive limiter definitions.`);
        }

        return limiter.consume(key);
    };

    return { consume };
};