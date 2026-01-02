export interface RateLimitResult{
    blocked: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
}

export interface Options {
    keyPrefix?: string;
    points: number;
    duration: number;
}

export interface RateLimiter {
    consume : (key: string) => Promise<RateLimitResult>;
}