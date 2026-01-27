This report documents a comparative analysis between Limitra, rate-limiter-flexible (RLF), and express-rate-limit (ERL).

My primary objectives were to answer two fundamental questions:

1. Is Limitra fast enough for production use? (Baseline Latency)
2. Can Limitra maintain service during infrastructure failures? (System Failure Survival)

## Methodology

All tests were conducted in a strictly isolated environment to ensure fair and reproducible results.

- **Environment**: Docker Containers running Node.js 20 Alpine
- **Database**: Shared Redis instance (Alpine)
- **Tooling**: k6 for load generation and latency measurement
- **Configuration Details**:
    - **Strict Production Mode**: The Redis client was configured with `enableOfflineQueue: false` and `commandTimeout: 1000ms`. This configuration mimics high-stakes production environments where hanging requests are unacceptable.
    - **Rate Limit**: 100 requests per 60 seconds

## Phase 1: Baseline Performance Under Normal Conditions

In this test, I measured the overhead introduced by each rate limiting solution under high concurrency when the system is operating normally.

- **Load**: 60 Concurrent Virtual Users
- **Duration**: 30 seconds

### Results

| Library | Avg Latency | P95 Latency (Tail) | Throughput |
| --- | --- | --- | --- |
| **Rate-Limiter-Flexible** | 8.84ms | 21.18ms | High |
| **Limitra** | **10.59ms** | **23.90ms** | **High** |
| Express-Rate-Limit | *Failed* | *Failed* | Low |

### Analysis

Limitra demonstrates strong performance characteristics. With a P95 latency of 23.90ms compared to rate-limiter-flexible's 21.18ms, Limitra introduces approximately 2.7ms of additional overhead. This minimal cost is the trade-off for the abstraction layer that enables the adaptive features demonstrated in Phase 2.

**Note on Express-Rate-Limit**: Under the strict "No Offline Queue" Redis configuration required for this test, express-rate-limit struggled to maintain connection stability under high load, resulting in a significant number of failed requests.

## Phase 2: Resilience Under Infrastructure Failure

This test represents the critical differentiator for production viability. I simulated a partial infrastructure failure to observe how each library handles adverse conditions.

- **Scenario**: At T+10 seconds, the Redis connection was forcibly severed to simulate a database outage
- **Expected Behavior**: The API should remain operational, falling back to a safe degraded mode

### Raw k6 Output

```
running (00m30.1s), 00/31 VUs, 7274 complete iterations

✓ limitra ok
     ↳  100% — ✓ 21722 / ✗ 0
✗ erl ok
     ↳  0% — ✓ 0 / ✗ 7273
✗ rlf ok
     ↳  0% — ✓ 0 / ✗ 7273

```

### Results

| Library | Success Rate | Avg Latency | Status During Outage |
| --- | --- | --- | --- |
| **Limitra** | **100%** | **13ms** | Auto-switched to in-memory storage |
| Express-Rate-Limit | 0% | N/A | System failure (500 errors and timeouts) |
| Rate-Limiter-Flexible | 0% | N/A | System failure (500 errors and timeouts) |

### Analysis

The results reveal a fundamental architectural difference:

1. **Autonomous Failover**: Limitra's AdaptiveLimiter successfully detected the unhealthy Redis state and immediately routed traffic to the local MemoryStore without manual intervention.
2. **Maintained Availability**: While competing solutions timed out or returned 500 errors due to their inability to reach Redis, Limitra maintained service with a 13ms average latency throughout the entire outage period.
3. **Production Reality**: In real-world scenarios, database hiccups are inevitable. The ability to gracefully degrade rather than fail completely can be the difference between a minor incident and a major outage.

## Conclusions

The data paints a clear picture: **Limitra is the superior choice for production-grade applications.**

While rate-limiter-flexible holds a negligible speed advantage (~2ms) in a perfect laboratory vacuum, that advantage becomes irrelevant the moment your infrastructure encounters real-world turbulence.

- **Competitors** turned a Redis glitch into a total system outage (0% success rate).
- **Limitra** turned a Redis glitch into a non-event (100% success rate).

In modern software architecture, **availability is the only metric that truly matters**. You should not have to choose between a rate limiter and 100% uptime. With Limitra, you get both.

**Limitra is the only library tested that guarantees your API stays online when your database goes offline.**

## Reproducing These Results

You can verify these benchmarks yourself using the code provided in this repository.

1. **Start the test environment**:
    
    ```bash
    cd benchmarks
    docker-compose up --build -d
    
    ```
    
2. **Execute the chaos test**:
    
    ```bash
    # Requires k6 to be installed locally
    k6 run k6-script.js
    
    ```
    

All test scripts and Docker configurations are included in the benchmarks directory for complete transparency and reproducibility.
