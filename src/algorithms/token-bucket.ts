import type {RateLimitOptions, RateLimitResult, RateLimiter, Store} from "../types"

export const createTokenBucket = (store: Store, options: RateLimitOptions): RateLimiter =>{
    const refillRate = options.points/options.duration //tokens per second

    const consume = async(key:string):Promise<RateLimitResult> =>{
        const { blocked, tokensLeft } = await store.consumeTokenBucket(
          key,
          options.points,
          refillRate
        );

        return {
            blocked,
            limit: options.points,
            remaining: Math.floor(tokensLeft), //for int
            resetTime: 0 //Token bucket doesn't have a hard "reset time" like fixed windows
        }
    }

    return {consume}
}