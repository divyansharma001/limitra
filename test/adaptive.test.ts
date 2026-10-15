import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdaptiveLimiter } from "../src/adaptive.js";
import type { RateLimiter } from "../src/types.js";

const ok = (tag: number): RateLimiter => ({ consume: async () => ({ blocked: false, limit: tag, remaining: 0, resetTime: 0 }) });
const broken = (calls: { n: number }): RateLimiter => ({ consume: async () => { calls.n++; throw new Error("redis down"); } });

test("uses the chosen strategy while it works", async () => {
    const limiter = createAdaptiveLimiter({ strategies: { normal: ok(1), panic: ok(2) }, selector: () => "normal", fallback: "panic" });
    assert.equal((await limiter.consume("k")).limit, 1);
});

test("falls back when the chosen strategy throws, instead of letting the error through", async () => {
    const limiter = createAdaptiveLimiter({ strategies: { normal: broken({ n: 0 }), panic: ok(2) }, selector: () => "normal", fallback: "panic" });
    assert.equal((await limiter.consume("k")).limit, 2);
});

test("skips a failed strategy during the cooldown, then tries it again", async () => {
    const calls = { n: 0 };
    const limiter = createAdaptiveLimiter({ strategies: { normal: broken(calls), panic: ok(2) }, selector: () => "normal", fallback: "panic", cooldownMs: 50 });
    await limiter.consume("k");
    await limiter.consume("k");
    await limiter.consume("k");
    assert.equal(calls.n, 1, "no new calls to the dead store while cooling down");
    await new Promise((r) => setTimeout(r, 60));
    await limiter.consume("k");
    assert.equal(calls.n, 2, "tried again after the cooldown");
});

test("without a fallback, errors still reach the caller (old behaviour)", async () => {
    const limiter = createAdaptiveLimiter({ strategies: { normal: broken({ n: 0 }) }, selector: () => "normal" });
    await assert.rejects(limiter.consume("k"), /redis down/);
});

test("an unknown fallback name fails at setup, not at the first outage", () => {
    assert.throws(() => createAdaptiveLimiter({ strategies: { normal: ok(1) }, selector: () => "normal", fallback: "nope" }), /Fallback strategy 'nope'/);
});
