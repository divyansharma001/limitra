# Limitra Architecture Diagram

## High-Level Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express Request                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │  limitra Middleware            │
         │  src/middleware.ts             │
         │                                │
         │ 1. Extract key (IP)            │
         │ 2. Call limiter.consume(key)   │
         │ 3. Set rate-limit headers      │
         │ 4. Block or next()             │
         └────────┬──────────────────────┘
                  │
                  ▼
    ┌──────────────────────────────────┐
    │  Adaptive Limiter                │
    │  src/adaptive.ts                 │
    │                                  │
    │ 1. Invoke selector()             │
    │ 2. Pick strategy name            │
    │ 3. Route to limiter              │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────────────┐
    │         Strategy Selection              │
    │         (Health-Based)                  │
    │                                         │
    │  Check Thresholds:                      │
    │  • Event Loop Lag > 50ms?               │
    │  • Memory > 80%?                        │
    │  • CPU > 80%?                           │
    │                                         │
    │  ✓ All OK → "normal"                    │
    │  ✗ Any exceeded → "panic"               │
    └──────────┬──────────────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
   NORMAL            PANIC
   Mode              Mode
   │                 │
   ▼                 ▼
┌──────────────┐ ┌──────────────────┐
│ Sliding      │ │ Fixed Window     │
│ Window       │ │                  │
│ Algorithm    │ │ Algorithm        │
│              │ │                  │
│src/algorithms│ │src/algorithms    │
│/sliding-     │ │/fixed-window.ts  │
│window.ts     │ │                  │
└──────┬───────┘ └────────┬─────────┘
       │                  │
       ▼                  ▼
    ┌──────────────┐   ┌────────────┐
    │ Redis Store  │   │Memory Store│
    │              │   │            │
    │ Distributed  │   │Local/Fast  │
    │ Counters     │   │In-Process  │
    │              │   │            │
    │src/store/    │   │src/store/  │
    │redis.ts      │   │memory.ts   │
    └──────┬───────┘   └────────┬───┘
           │                    │
           ▼                    ▼
     ┌──────────────┐    ┌──────────────┐
     │Redis Instance│    │JS Map Object │
     └──────────────┘    └──────────────┘
```

## Component Interaction Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     Application Layer                           │
│                   (Express Server)                              │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                              │ app.use(limitra({...}))
                              ▼
                    ┌─────────────────────┐
                    │  Middleware         │
                    │  (src/middleware.ts)│
                    │                     │
                    │ keyGenerator(req)   │
                    │ ├─ Custom logic or  │
                    │ └─ Default: req.ip  │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────┐
                    │ Adaptive Limiter        │
                    │ (src/adaptive.ts)       │
                    │                         │
                    │ strategies: {           │
                    │   "normal": {...},      │
                    │   "panic": {...}        │
                    │ }                       │
                    │                         │
                    │ selector: async ()      │
                    └────────┬────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
          ┌─────────┐  ┌─────────┐  ┌──────────┐
          │  Event  │  │ Memory  │  │   CPU    │
          │  Loop   │  │ Usage   │  │  Load    │
          │  Lag    │  │ Percent │  │ Percent  │
          └────┬────┘  └────┬────┘  └────┬─────┘
               │             │            │
               └─────────────┼────────────┘
                             │
                    ┌────────▼────────┐
                    │ Health Checker  │
                    │ (src/utils/     │
                    │  health.ts)     │
                    │                 │
                    │ Returns:        │
                    │ "normal" |      │
                    │ "panic"         │
                    └────────┬────────┘
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
          ▼                                     ▼
    ┌───────────────────┐            ┌──────────────────┐
    │  Normal Limiter   │            │  Panic Limiter   │
    │                   │            │                  │
    │ Sliding Window    │            │ Fixed Window     │
    │ + Redis Store     │            │ + Memory Store   │
    │                   │            │                  │
    │ Algorithm:        │            │ Algorithm:       │
    │ src/algorithms/   │            │ src/algorithms/  │
    │ sliding-window.ts │            │ fixed-window.ts  │
    │                   │            │                  │
    │ Store:            │            │ Store:           │
    │ src/store/        │            │ src/store/       │
    │ redis.ts          │            │ memory.ts        │
    └────────┬──────────┘            └────────┬─────────┘
             │                                │
             ▼                                ▼
      ┌────────────────┐           ┌──────────────────┐
      │  Redis Client  │           │  JS Map          │
      │  (ioredis)     │           │  <key, data>     │
      │                │           │                  │
      │ Shared State   │           │ Local State      │
      │ Multi-instance │           │ Single-instance  │
      └────────────────┘           └──────────────────┘
```

## Store Abstraction Interface

```
┌──────────────────────────────────────────┐
│         Store Interface                  │
│         (src/types.ts)                   │
│                                          │
│ increment(key, windowSeconds)            │
│   → { count, resetTime }                 │
│                                          │
│ get(key)                                 │
│   → count                                │
│                                          │
│ consumeTokenBucket(key, capacity,        │
│   refillRate)                            │
│   → { blocked, tokensLeft }              │
└──────────┬──────────────────────────────┘
           │
      ┌────┴───────┐
      │            │
      ▼            ▼
┌─────────────┐  ┌──────────────┐
│Redis Store  │  │Memory Store  │
│             │  │              │
│Network I/O  │  │Direct Memory │
│Distributed  │  │Local Only    │
│Persistent   │  │Ephemeral     │
└─────────────┘  └──────────────┘
```

## Algorithm Comparison

```
┌──────────────────────────────────────────────────────────────┐
│                   Available Algorithms                        │
└──────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────┐
│       Sliding Window                   │
│   src/algorithms/sliding-window.ts     │
│                                        │
│ Two-window approach:                   │
│ • Current window + weighted previous   │
│ • Smooth edges, prevents bursts        │
│ • Higher accuracy                      │
│ • More CPU (weighted calculation)      │
│                                        │
│ Best for: Precision, fairness          │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│       Fixed Window                     │
│   src/algorithms/fixed-window.ts       │
│                                        │
│ Single bucket per time period:         │
│ • Simple increment & reset             │
│ • Fast, minimal overhead               │
│ • May allow bursts at window edges     │
│ • Lowest CPU & I/O                     │
│                                        │
│ Best for: Speed, simplicity, panic     │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│       Token Bucket                     │
│   src/algorithms/token-bucket.ts       │
│                                        │
│ Refill over time:                      │
│ • Capacity + refill rate               │
│ • Smooth burst handling                │
│ • Good for varying load                │
│ • Medium complexity                    │
│                                        │
│ Best for: Flexible bursts, smooth flow │
└────────────────────────────────────────┘
```

## Health Checking & Panic Mode Trigger

```
┌──────────────────────────────────────────────────────────┐
│         Health Probes (Per Request)                      │
│         (src/utils/health.ts)                            │
└──────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 1. Event Loop Lag                                       │
│    src/utils/health.ts::measureEventLoopLag()           │
│                                                         │
│    Uses setImmediate to measure scheduling delay:       │
│    const lag = end - start (in milliseconds)            │
│                                                         │
│    Threshold: > 50ms → PANIC                            │
│    Why: High lag indicates CPU saturation              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 2. Memory Usage                                         │
│    process.memoryUsage()                                │
│                                                         │
│    Tracks heap usage:                                   │
│    percent = (heapUsed / heapTotal) * 100              │
│                                                         │
│    Threshold: > 80% → PANIC                             │
│    Why: Memory pressure reduces GC efficiency          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 3. CPU Load                                             │
│    os.loadavg()[0] (1-minute average)                  │
│                                                         │
│    Calculates percentage:                               │
│    percent = (cpuLoad / numCpus) * 100                 │
│                                                         │
│    Threshold: > 80% of cores → PANIC                    │
│    Why: System approaching saturation                  │
└─────────────────────────────────────────────────────────┘

              All checks passed?
                     │
          ┌──────────┼──────────┐
          │          │          │
         YES        NO         NO
          │          │          │
          ▼          ▼          ▼
      NORMAL      PANIC      PANIC
      Mode        Mode       Mode
      │           │          │
      └───────────┴──────────┘
                  │
          Return strategy name
```

## Request Lifecycle (Complete)

```
HTTP Request
    │
    ├─► Extract IP as key: "192.168.1.1"
    │
    ▼
Middleware calls: limiter.consume("192.168.1.1")
    │
    ├─► Adaptive Limiter invokes: selector()
    │
    ├─► Selector checks health:
    │   ├─ measureEventLoopLag()
    │   ├─ process.memoryUsage()
    │   └─ os.loadavg()
    │
    ├─► Returns: "normal" or "panic"
    │
    ├─► Route to appropriate limiter:
    │   │
    │   ├─ IF "normal":
    │   │  └─ SlidingWindow + RedisStore
    │   │
    │   └─ IF "panic":
    │      └─ FixedWindow + MemoryStore
    │
    ├─► Algorithm consumes the limit:
    │   └─ Store::increment() or consumeTokenBucket()
    │
    ├─► Returns RateLimitResult:
    │   ├─ blocked: boolean
    │   ├─ limit: number
    │   ├─ remaining: number
    │   └─ resetTime: number
    │
    ▼
Middleware processes result:
    │
    ├─► Sets headers:
    │   ├─ X-RateLimit-Limit: 100
    │   ├─ X-RateLimit-Remaining: 45
    │   ├─ X-RateLimit-Reset: 1705618920
    │   └─ Retry-After: 10
    │
    ├─► Is blocked?
    │   │
    │   ├─ YES:
    │   │  └─ Return 429 + message
    │   │
    │   └─ NO:
    │      └─ Call next() → Route handler
    │
    ▼
Response
```

## Directory Structure & Module Relationships

```
src/
├── types.ts
│   └─ Core interfaces: RateLimiter, Store, RateLimitResult
│      ↑ Implemented by all stores and algorithms
│
├── index.ts
│   └─ Export all public APIs
│
├── middleware.ts
│   └─ Express integration
│      Depends on: RateLimiter (from types.ts)
│
├── adaptive.ts
│   └─ Strategy selector and router
│      Depends on: RateLimiter (from types.ts)
│
├── algorithms/
│   ├── sliding-window.ts
│   │   └─ Implements RateLimiter interface
│   │      Depends on: Store, RateLimitOptions
│   │
│   ├── fixed-window.ts
│   │   └─ Implements RateLimiter interface
│   │      Depends on: Store, RateLimitOptions
│   │
│   └── token-bucket.ts
│       └─ Implements RateLimiter interface
│          Depends on: Store
│
├── store/
│   ├── redis.ts
│   │   └─ Implements Store interface
│   │      Depends on: Redis client (ioredis)
│   │
│   └── memory.ts
│       └─ Implements Store interface
│          Depends on: (None - pure JS)
│
└── utils/
    └── health.ts
        └─ System health probes
           Depends on: (None - native Node APIs)
```

## Typical Deployment Scenario

```
┌─────────────────────────────────────────────────────────┐
│                  Multi-Instance Setup                   │
│                  (Distributed System)                   │
└─────────────────────────────────────────────────────────┘

    Instance A                Instance B                Instance C
    ┌──────────┐              ┌──────────┐              ┌──────────┐
    │ Express  │              │ Express  │              │ Express  │
    │ + Limitra│              │ + Limitra│              │ + Limitra│
    └────┬─────┘              └────┬─────┘              └────┬─────┘
         │                         │                         │
         ▼                         ▼                         ▼
    ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
    │ Sliding      │          │ Sliding      │          │ Sliding      │
    │ Window       │          │ Window       │          │ Window       │
    │              │          │              │          │              │
    │ Fixed        │          │ Fixed        │          │ Fixed        │
    │ Window       │          │ Window       │          │ Window       │
    └────┬─────────┘          └────┬─────────┘          └────┬─────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │    Redis Cluster     │
                        │                      │
                        │ Shared state across  │
                        │ all instances        │
                        │                      │
                        │ Used by Sliding      │
                        │ Window (normal mode) │
                        └──────────────────────┘

Each instance also:
• Has in-process Memory store (for panic mode)
• Independently measures its own health
• Can switch to panic without coordination
• Falls back gracefully if Redis unavailable
```

This architecture ensures Limitra is:
- **Modular**: swap algorithms/stores freely
- **Resilient**: panic mode survives failures
- **Observable**: health metrics guide behavior
- **Distributed**: Redis enables shared state
- **Lightweight**: memory store for low overhead
