# Network Delay Time

**Difficulty:** Medium · **Pattern:** Single-source shortest path (Dijkstra with a priority queue) · [LeetCode](https://leetcode.com/problems/network-delay-time/)

## Problem
Given a directed weighted network of `n` nodes and travel times `times[i] = (u, v, w)`, find the minimum time for a signal sent from node `k` to reach every node. Return the max over all shortest distances, or `-1` if some node is unreachable.

## Examples
**Example 1**
```
Input:  times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2
Output: 2
Explanation: From 2 -> 1 (1), 2 -> 3 (1) -> 4 (1). Max shortest distance among {1,3,4} is 2.
```

## Constraints
- `1 <= k <= n <= 100`
- `1 <= times.length <= 6000`
- `0 <= u_i, v_i <= n`, `1 <= w_i <= 100`
- All `(u_i, v_i)` pairs are unique.

## Approach 1 — Bellman-Ford (relax all edges n-1 times)
**Idea.** Since edges can be relaxed repeatedly without a priority queue, run `n-1` rounds relaxing every edge; this correctly handles the single-source shortest path problem even though it's slower than Dijkstra.
**Complexity.** Time O(n · E), Space O(n).
```java
class Solution {
    public int networkDelayTime(int[][] times, int n, int k) {
        int[] dist = new int[n + 1];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[k] = 0;
        for (int i = 0; i < n - 1; i++) {
            boolean changed = false;
            for (int[] t : times) {
                int u = t[0], v = t[1], w = t[2];
                if (dist[u] != Integer.MAX_VALUE && dist[u] + w < dist[v]) {
                    dist[v] = dist[u] + w;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        int max = 0;
        for (int i = 1; i <= n; i++) {
            if (dist[i] == Integer.MAX_VALUE) return -1;
            max = Math.max(max, dist[i]);
        }
        return max;
    }
}
```

## Approach 2 — Dijkstra with min-heap (optimal)
**Idea.** Build an adjacency list, then run Dijkstra from `k`: pop the closest unfinalized node, relax its neighbors, and push improved distances. Because all weights are positive, the first time a node is popped its distance is final.
**Complexity.** Time O(E log V), Space O(V + E).
```java
class Solution {
    public int networkDelayTime(int[][] times, int n, int k) {
        List<List<int[]>> graph = new ArrayList<>();
        for (int i = 0; i <= n; i++) graph.add(new ArrayList<>());
        for (int[] t : times) graph.get(t[0]).add(new int[]{t[1], t[2]});

        int[] dist = new int[n + 1];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[k] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
        pq.offer(new int[]{k, 0});
        boolean[] visited = new boolean[n + 1];

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int node = cur[0], d = cur[1];
            if (visited[node]) continue;
            visited[node] = true;
            for (int[] edge : graph.get(node)) {
                int next = edge[0], w = edge[1];
                if (d + w < dist[next]) {
                    dist[next] = d + w;
                    pq.offer(new int[]{next, dist[next]});
                }
            }
        }

        int max = 0;
        for (int i = 1; i <= n; i++) {
            if (dist[i] == Integer.MAX_VALUE) return -1;
            max = Math.max(max, dist[i]);
        }
        return max;
    }
}
```

## Key Takeaways
- Dijkstra with a lazy-deletion heap is the standard O(E log V) template for non-negative weighted single-source shortest paths.
- Bellman-Ford is a useful fallback when you need to reason about negative weights or want a simpler mental model at the cost of speed.
- The answer is the max finite distance, not the sum — one unreachable node means the whole network fails.
