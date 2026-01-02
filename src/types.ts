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

export interface RateLimiter {
    consume : (key: string) => Promise<RateLimitResult>;
}