import type { Request, Response, NextFunction } from "express";
import type { RateLimiter } from "./types.js";

interface MiddlewareOptions {
    limiter: RateLimiter;
    keyGenerator?: (req: Request) => string;
    message?: string | object;
    statusCode?: number;
}

export const limitra = (options: MiddlewareOptions) => {
    const { 
        limiter, 
        keyGenerator = (req) => req.ip || "127.0.0.1",
        message = "Too many requests, please try again later.",
        statusCode = 429
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const key = keyGenerator(req);
            const result = await limiter.consume(key);

            res.set("X-RateLimit-Limit", String(result.limit));
            res.set("X-RateLimit-Remaining", String(result.remaining));
            
            if (result.resetTime > 0) {
                const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
                res.set("Retry-After", String(retryAfter));
                res.set("X-RateLimit-Reset", String(Math.ceil(result.resetTime / 1000)));
            }

            if (result.blocked) {
                res.status(statusCode).send(message);
                return;
            }

            next();
        } catch (error) {
            console.error("Rate Limit Error:", error);
            next();
        }
    };
};