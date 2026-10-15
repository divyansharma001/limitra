import type { RateLimiter, RateLimitResult } from "./types.js";


type StrategySelector = (key: string) => Promise<string> | string;

interface AdaptiveOptions {
    strategies: Record<string, RateLimiter>;
    selector: StrategySelector;
    /**
     * Strategy to use when the chosen one throws, for example a memory limiter for when Redis is down.
     * Without it, an error reaches the middleware, which lets the request through unlimited.
     */
    fallback?: string;
    /** After a strategy throws, skip it for this long (ms) and go straight to the fallback. Default 5000. */
    cooldownMs?: number;
}

export const createAdaptiveLimiter = (options: AdaptiveOptions): RateLimiter => {
    const { strategies, selector, fallback, cooldownMs = 5000 } = options;
    if (fallback !== undefined && !strategies[fallback]) {
        throw new Error(`Fallback strategy '${fallback}' not found in adaptive limiter definitions.`);
    }
    const downUntil = new Map<string, number>();   // strategy name -> time it may be tried again

    const pick = (name: string): RateLimiter => {
        const limiter = strategies[name];
        if (!limiter) {
            throw new Error(`Strategy '${name}' not found in adaptive limiter definitions.`);
        }
        return limiter;
    };

    const consume = async (key: string): Promise<RateLimitResult> => {
        let name = await selector(key);
        if (fallback === undefined || name === fallback) {
            return pick(name).consume(key);
        }
        if ((downUntil.get(name) ?? 0) > Date.now()) {
            name = fallback;   // still cooling down after a failure: do not wait on it again
            return pick(name).consume(key);
        }
        try {
            return await pick(name).consume(key);
        } catch {
            downUntil.set(name, Date.now() + cooldownMs);
            return pick(fallback).consume(key);
        }
    };

    return { consume };
};
