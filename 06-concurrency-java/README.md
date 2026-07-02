# 06 — Java Concurrency & JVM

> **Status: STUB.** Say "next" (or name this directory) in the prep session to have it
> written in full. Every document here will follow the five-part teaching contract
> (definition → practice → senior depth → resume connection → interviewer probes)
> and end with a 10+ question self-test with hidden answers.

## Planned documents

- 01-threads-and-memory-model.md — JMM, happens-before, volatile, safe publication
- 02-locks-vs-cas.md — synchronized/ReentrantLock vs Atomic*/VarHandle; contention behavior
- 03-executors-and-pools.md — sizing math, queue choices, rejection policies (maps to Hystrix pools)
- 04-virtual-threads.md — Loom in 2026; how it changes the async-vs-thread-per-request calculus your platform was built around
- 05-jvm-internals.md — classloading, JIT, escape analysis
- 06-gc-deep-dive.md — G1/ZGC/Shenandoah, pause numbers, tuning for latency-sensitive payment services
- 07-deadlocks-and-hazards.md — lock ordering, thread-pool deadlock (Hystrix same-pool reentrancy), ThreadLocal leaks
