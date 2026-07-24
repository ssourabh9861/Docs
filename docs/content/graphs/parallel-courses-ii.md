# Parallel Courses II

**Difficulty:** Hard · **Pattern:** Bitmask DP over "taken courses" states, driven by prerequisite topology (up to `k` courses per semester) · [LeetCode](https://leetcode.com/problems/parallel-courses-ii/)

## Problem
There are `n` courses (1..n) and a list of prerequisite pairs. In each semester you may take at most `k` courses, but only if all their prerequisites were completed in a strictly earlier semester. Return the minimum number of semesters to finish all courses.

## Examples
**Example 1**
```
Input:  n = 4, relations = [[2,1],[3,1],[1,4]], k = 2
Output: 3
Explanation: Semester 1: {2,3}; Semester 2: {1}; Semester 3: {4}. Course 1 needs both 2 and 3 done first.
```
**Example 2**
```
Input:  n = 5, relations = [[2,1],[3,1],[4,1],[1,5]], k = 2
Output: 4
Explanation: Only 2 courses per semester means {2,3},{4},{1},{5} — 4 semesters even though only 2,3,4 depend on nothing.
```

## Constraints
- 1 <= n <= 15
- 0 <= relations.length <= n*(n-1)/2
- 1 <= k <= n
- The graph is a DAG (no cycles)

## Approach 1 — BFS over bitmask states (state = set of completed courses)
**Idea.** Represent the set of completed courses as a bitmask (n <= 15 fits in an int). From a state, compute the set of "available" courses — not yet taken, whose prerequisite mask is fully contained in the current state. Enumerate all subsets of the available set of size <= k, and transition to `state | subset`. BFS layer = semester count; first time we reach the full mask is the answer.
**Complexity.** Time O(2^n * 3^(available size)) roughly — subset enumeration via submask trick, Space O(2^n).
```java
class Solution {
    public int minNumberOfSemesters(int n, int[][] relations, int k) {
        int[] prereqMask = new int[n + 1]; // 1-indexed courses
        for (int[] r : relations) {
            prereqMask[r[1]] |= (1 << (r[0] - 1));
        }

        int full = (1 << n) - 1;
        int[] dist = new int[1 << n];
        Arrays.fill(dist, -1);
        dist[0] = 0;

        Deque<Integer> queue = new ArrayDeque<>();
        queue.add(0);

        while (!queue.isEmpty()) {
            int state = queue.poll();
            if (state == full) return dist[state];

            int available = 0;
            for (int c = 1; c <= n; c++) {
                int bit = 1 << (c - 1);
                if ((state & bit) == 0 && (prereqMask[c] & state) == prereqMask[c]) {
                    available |= bit;
                }
            }

            // enumerate all subsets of `available` with popcount <= k
            for (int sub = available; sub > 0; sub = (sub - 1) & available) {
                if (Integer.bitCount(sub) <= k) {
                    int next = state | sub;
                    if (dist[next] == -1) {
                        dist[next] = dist[state] + 1;
                        queue.add(next);
                    }
                }
            }
        }
        return dist[full];
    }
}
```

## Approach 2 — Greedy-pruned bitmask DP, take the largest available subset first (optimal in practice)
**Idea.** Same state space, but instead of enumerating every subset of `available`, prefer subsets close to size `k` first (or just take min(k, |available|) courses in all combinations of that exact size) since taking fewer than possible in a semester never helps reach the goal faster. This prunes many redundant subset transitions and speeds up the search while keeping correctness — BFS still guarantees the shortest path in semesters.
**Complexity.** Time O(2^n * 2^m) where m = |available| (bounded by n <= 15), Space O(2^n).
```java
class Solution {
    private int[] dist;
    private int[] prereqMask;
    private int n, k, full;

    public int minNumberOfSemesters(int n, int[][] relations, int k) {
        this.n = n;
        this.k = k;
        this.full = (1 << n) - 1;
        prereqMask = new int[n + 1];
        for (int[] r : relations) prereqMask[r[1]] |= (1 << (r[0] - 1));

        dist = new int[1 << n];
        Arrays.fill(dist, -1);
        dist[0] = 0;
        Deque<Integer> queue = new ArrayDeque<>();
        queue.add(0);

        while (!queue.isEmpty()) {
            int state = queue.poll();
            if (state == full) return dist[state];

            int available = 0;
            for (int c = 1; c <= n; c++) {
                int bit = 1 << (c - 1);
                if ((state & bit) == 0 && (prereqMask[c] & state) == prereqMask[c]) {
                    available |= bit;
                }
            }

            // only keep maximal subsets (size == min(k, popcount(available))) —
            // taking fewer courses than allowed is always dominated.
            int need = Math.min(k, Integer.bitCount(available));
            for (int sub = available; sub > 0; sub = (sub - 1) & available) {
                if (Integer.bitCount(sub) == need) {
                    int next = state | sub;
                    if (dist[next] == -1) {
                        dist[next] = dist[state] + 1;
                        queue.add(next);
                    }
                }
            }
        }
        return dist[full];
    }
}
```

## Key Takeaways
- `n <= 15` is the tell for bitmask DP/BFS over `2^n` states — represent "completed courses" as a bitmask, not a Set.
- A course is available in a state iff its prerequisite mask is a submask of the current state: `(prereqMask[c] & state) == prereqMask[c]`.
- BFS layer number directly equals semester count because every transition (one semester) has uniform cost 1; restricting to maximal subsets (size `min(k, |available|)`) is a valid and effective pruning since taking fewer courses than the cap is never beneficial.
