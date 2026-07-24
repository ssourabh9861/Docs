# Shortest Path Visiting All Nodes

**Difficulty:** Hard · **Pattern:** BFS / Held-Karp DP over (current node, visited-mask) states · [LeetCode](https://leetcode.com/problems/shortest-path-visiting-all-nodes/)

## Problem
Given an undirected connected graph as `graph[i]` = list of neighbors of node `i`, find the length of the shortest path that visits every node at least once. You may start at any node, revisit nodes, and reuse edges.

## Examples
**Example 1**
```
Input:  graph = [[1,2,3],[0],[0],[0]]
Output: 4
Explanation: One shortest path: 1 -> 0 -> 2 -> 0 -> 3 (4 edges), visiting all 4 nodes.
```
**Example 2**
```
Input:  graph = [[1],[0,2,4],[1,3,4],[2],[1,2]]
Output: 4
Explanation: One shortest path: 0 -> 1 -> 4 -> 2 -> 3.
```

## Constraints
- `n == graph.length`
- `1 <= n <= 12`
- `0 <= graph[i].length < n`
- Graph is connected and undirected (edges appear symmetrically, no self-loops, no repeated edges).

## Approach 1 — Held-Karp style DP with BFS-level relaxation (multi-source BFS)
**Idea.** State = `(node, mask)` where `mask` is the set of visited nodes so far; `dist[node][mask]` = shortest path length reaching `node` having visited exactly `mask`. Since all edge weights are 1, BFS over this state graph gives shortest distances directly, which is simpler and more reliable to implement correctly than a pure DP recurrence with min over predecessors. Initialize the BFS frontier with all `(i, {i})` at distance 0 (any node can be the start), then expand by moving along graph edges, updating the mask by OR-ing in the newly visited node. The answer is the smallest distance at which some state `(node, fullMask)` is reached.

**Complexity.** Time O(n · 2^n) states, each with O(n) edges to relax → O(n^2 · 2^n). Space O(n · 2^n).
```java
import java.util.*;

class Solution {
    public int shortestPathLength(int[][] graph) {
        int n = graph.length;
        int full = (1 << n) - 1;
        if (n == 1) return 0;

        // dist[mask][node]
        int[][] dist = new int[1 << n][n];
        for (int[] row : dist) Arrays.fill(row, -1);

        Deque<int[]> queue = new ArrayDeque<>(); // {mask, node}
        for (int i = 0; i < n; i++) {
            int mask = 1 << i;
            dist[mask][i] = 0;
            queue.offer(new int[]{mask, i});
        }

        while (!queue.isEmpty()) {
            int[] cur = queue.poll();
            int mask = cur[0], node = cur[1];
            int d = dist[mask][node];

            if (mask == full) return d;

            for (int next : graph[node]) {
                int nextMask = mask | (1 << next);
                if (dist[nextMask][next] == -1) {
                    dist[nextMask][next] = d + 1;
                    queue.offer(new int[]{nextMask, next});
                }
            }
        }
        return -1; // unreachable given problem guarantees connectivity
    }
}
```

## Approach 2 — Held-Karp DP with explicit transition table (optimal, same complexity, iterative form)
**Idea.** Process masks in increasing order (a mask's states only need masks that are subsets, i.e. numerically ≤ itself when built by adding one bit at a time isn't strictly monotonic in value, so instead do a BFS/multi-pass relaxation, or process by popcount layers). A clean iterative variant: run repeated relaxation rounds analogous to Bellman-Ford, since BFS already gives optimal order — the version below achieves the same result via explicit layer-by-layer (increasing mask popcount) DP, which is the classic Held-Karp structure and avoids needing a queue.

**Complexity.** Time O(n^2 · 2^n), Space O(n · 2^n).
```java
import java.util.*;

class Solution {
    public int shortestPathLength(int[][] graph) {
        int n = graph.length;
        int full = (1 << n) - 1;
        if (n == 1) return 0;

        int INF = Integer.MAX_VALUE / 2;
        int[][] dp = new int[1 << n][n]; // dp[mask][node] = shortest steps to reach node having visited mask
        for (int[] row : dp) Arrays.fill(row, INF);
        for (int i = 0; i < n; i++) dp[1 << i][i] = 0;

        // Process masks in increasing numeric order; a state (mask, node) is finalized
        // only after all masks that are strict subsets (numerically smaller when
        // built by single-bit additions) have propagated — sorting by popcount then
        // value guarantees this.
        Integer[] masks = new Integer[1 << n];
        for (int m = 0; m < (1 << n); m++) masks[m] = m;
        Arrays.sort(masks, Comparator.comparingInt(Integer::bitCount));

        for (int mask : masks) {
            for (int node = 0; node < n; node++) {
                if (dp[mask][node] >= INF) continue;
                int d = dp[mask][node];
                for (int next : graph[node]) {
                    int nextMask = mask | (1 << next);
                    if (d + 1 < dp[nextMask][next]) {
                        dp[nextMask][next] = d + 1;
                    }
                }
            }
        }

        int ans = INF;
        for (int node = 0; node < n; node++) {
            ans = Math.min(ans, dp[full][node]);
        }
        return ans;
    }
}
```

## Key Takeaways
- Because all edges have weight 1, BFS over `(node, mask)` states is both simpler and safer than writing the Held-Karp min-recurrence by hand — the first state that reaches `fullMask` is guaranteed shortest.
- Multi-source seeding (`dist[1<<i][i] = 0` for every `i`) captures "start anywhere" without needing to try each start separately.
- State space is `O(n · 2^n)`, feasible up to `n = 12` (`12 · 4096 ≈ 49k` states) — this bound is what caps the problem's `n` at 12.
