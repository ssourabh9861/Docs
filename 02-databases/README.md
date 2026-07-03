# 02 — Databases

**Status: ✅ Complete.** Eight documents on the five-part contract, each ending
in a hidden-answer self-test. You operate three engine families in production —
these docs turn that into cross-engine literacy, which is rarer and more
valuable than depth in any single one.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [Storage engines](01-storage-engines.md) | B-tree vs LSM with the three amplifications quantified — "B-trees pay at write time; LSMs pay at read+compaction time" |
| 2 | [SQL vs NoSQL taxonomy](02-sql-vs-nosql-taxonomy.md) | The four-axis analysis that dissolves the false binary; eight families; transaction scope as the sharpest differentiator |
| 3 | [Indexing](03-indexing.md) | Leftmost-prefix, covering, the write-side ledger — and what maintaining indexes *by hand* in HBase taught you about engines |
| 4 | [Transactions & isolation](04-transactions-isolation.md) | The anomaly→level ladder, MVCC mechanics, write skew (the boss anomaly), and living without transactions |
| 5 | [HBase internals](05-hbase-internals.md) | Your system of record down to WAL splits, compaction-shaped latency, and the five-level CAS trust chain |
| 6 | [Aerospike internals](06-aerospike-internals.md) | Index-in-RAM/data-on-flash arithmetic, 4096 partitions, generation CAS, AP-vs-SC — and the mechanism-level Redis comparison |
| 7 | [MySQL/InnoDB internals](07-mysql-innodb-internals.md) | The four artifacts (buffer pool, redo, undo, binlog), the internal 2PC, locks-on-index-entries, deadlock retry contracts |
| 8 | [When to pick what](08-when-to-pick-what.md) | The five-question procedure with capacity anchors — your platform reconstructed as four worked decisions |

## The five sentences to walk into any interview with

1. "B-trees pay at write time to make reads simple; LSMs pay at read-and-
   compaction time to make writes sequential — and the pager knows the
   difference."
2. "Choose the store whose native atomic unit matches your invariants, or
   budget the compensation engineering — sagas, markers, recon."
3. "In HBase the row key is the only index, so key design IS query planning —
   and every other access path is a derived view someone must maintain."
4. "Write skew survives snapshot isolation; my default fix is materializing
   the invariant into a row both transactions must touch."
5. "Default to relational; exit per-dataset for a named reason with a named
   trade — and most workloads never earn the exit."

## Self-test discipline

Cold self-tests ≥3 days after reading; misses go to the spaced-repetition deck
(`15-mock-interviews/` when written).
