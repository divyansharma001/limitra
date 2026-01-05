export interface RateLimitResult {
    blocked: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
}

export interface RateLimitOptions {
    points: number;
    duration: number;
}

export interface TokenBucketResult {
    blocked: boolean;
    tokensLeft: number;
}

export interface Store {
    increment: (key: string, windowSeconds: number) => Promise<{ count: number; resetTime: number }>;

    consumeTokenBucket: (
        key: string,
        capacity: number,
        refillTokens: number,
    ) => Promise<TokenBucketResult>;
}

export interface RateLimiter {
    consume: (key: string) => Promise<RateLimitResult>;
}