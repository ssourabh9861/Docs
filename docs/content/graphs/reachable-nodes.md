# Reachable Nodes In Subdivided Graph

**Difficulty:** Hard · **Pattern:** Dijkstra with edge subdivision accounting · [LeetCode](https://leetcode.com/problems/reachable-nodes-in-subdivided-graph/)

## Problem
An undirected graph has edges `[u, v, cnt]`, meaning `cnt` new nodes are inserted between `u` and `v`, subdividing that edge into a path of `cnt+1` unit edges. Starting from node 0 with a maximum of `maxMoves` moves, count how many nodes (original nodes plus subdivision nodes) are reachable.

## Examples
**Example 1**
```
Input:  edges = [[0,1,10],[0,2,1],[1,2,2]], maxMoves = 6, n = 3
Output: 13
Explanation: All 3 original nodes are reachable, plus 10 subdivision nodes on edge 0-1 (partially) and edges 0-2, 1-2 fully — total counted reachable nodes sums to 13.
```

## Constraints
- `0 <= edges.length <= min(n * (n - 1) / 2, 10^4)`
- `edges[i].length == 3`
- `0 <= u_i < v_i < n`
- `0 <= cnt_i <= 10^4`
- No two edges connect the same pair of nodes.
- `0 <= maxMoves <= 10^9`
- `1 <= n <= 3000`

## Approach 1 — Dijkstra on original nodes, then tally subdivision nodes per edge
**Idea.** Run Dijkstra treating each original edge's weight as `cnt+1` (the subdivided path length) to find `dist[]`, the fewest moves to reach each original node. An original node counts if `dist[node] <= maxMoves`. For each edge `(u, v, cnt)`, the number of reachable subdivision nodes from the `u` side is `min(cnt, max(0, maxMoves - dist[u]))`, and symmetrically from the `v` side; sum both sides but cap the total at `cnt` since the two sides' walks can overlap and cover the whole subdivided edge.
**Complexity.** Time O(E log V), Space O(V + E).
```java
class Solution {
    public int reachableNodes(int[][] edges, int maxMoves, int n) {
        Map<Integer, Map<Integer, Integer>> graph = new HashMap<>();
        for (int[] e : edges) {
            int u = e[0], v = e[1], cnt = e[2];
            graph.computeIfAbsent(u, k -> new HashMap<>()).put(v, cnt);
            graph.computeIfAbsent(v, k -> new HashMap<>()).put(u, cnt);
        }

        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[0] = 0;
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
        pq.offer(new int[]{0, 0});
        boolean[] visited = new boolean[n];

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int node = cur[0], d = cur[1];
            if (visited[node]) continue;
            visited[node] = true;
            if (!graph.containsKey(node)) continue;
            for (Map.Entry<Integer, Integer> entry : graph.get(node).entrySet()) {
                int next = entry.getKey();
                int weight = entry.getValue() + 1; // cnt subdivision nodes + 1 unit to reach original node
                if (d + weight < dist[next]) {
                    dist[next] = d + weight;
                    pq.offer(new int[]{next, dist[next]});
                }
            }
        }

        int reachableOriginal = 0;
        for (int i = 0; i < n; i++) {
            if (dist[i] <= maxMoves) reachableOriginal++;
        }

        int reachableSub = 0;
        for (int[] e : edges) {
            int u = e[0], v = e[1], cnt = e[2];
            int fromU = (dist[u] < maxMoves) ? Math.min(cnt, maxMoves - dist[u]) : 0;
            int fromV = (dist[v] < maxMoves) ? Math.min(cnt, maxMoves - dist[v]) : 0;
            reachableSub += Math.min(cnt, fromU + fromV);
        }

        return reachableOriginal + reachableSub;
    }
}
```

## Approach 2 — Array-based Dijkstra on an adjacency matrix (optimal for dense graphs)
**Idea.** With `n` up to 3000 but edges capped at `n*(n-1)/2`, a heap-free O(n^2) Dijkstra using an adjacency matrix can beat the heap version on dense inputs and avoids boxed `int[]` heap churn. Pick the closest unvisited node by linear scan each round instead of a priority queue, then relax exactly as before.
**Complexity.** Time O(n^2), Space O(n^2).
```java
class Solution {
    public int reachableNodes(int[][] edges, int maxMoves, int n) {
        int[][] weight = new int[n][n];
        for (int[] row : weight) Arrays.fill(row, -1);
        for (int[] e : edges) {
            int u = e[0], v = e[1], cnt = e[2];
            weight[u][v] = cnt + 1;
            weight[v][u] = cnt + 1;
        }

        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[0] = 0;
        boolean[] visited = new boolean[n];

        for (int iter = 0; iter < n; iter++) {
            int node = -1;
            for (int i = 0; i < n; i++) {
                if (!visited[i] && (node == -1 || dist[i] < dist[node])) node = i;
            }
            if (node == -1 || dist[node] == Integer.MAX_VALUE) break;
            visited[node] = true;

            for (int next = 0; next < n; next++) {
                if (weight[node][next] == -1 || visited[next]) continue;
                if (dist[node] + weight[node][next] < dist[next]) {
                    dist[next] = dist[node] + weight[node][next];
                }
            }
        }

        int reachableOriginal = 0;
        for (int i = 0; i < n; i++) if (dist[i] <= maxMoves) reachableOriginal++;

        int reachableSub = 0;
        for (int[] e : edges) {
            int u = e[0], v = e[1], cnt = e[2];
            int fromU = (dist[u] < maxMoves) ? Math.min(cnt, maxMoves - dist[u]) : 0;
            int fromV = (dist[v] < maxMoves) ? Math.min(cnt, maxMoves - dist[v]) : 0;
            reachableSub += Math.min(cnt, fromU + fromV);
        }
        return reachableOriginal + reachableSub;
    }
}
```

## Key Takeaways
- Treat each subdivided edge's weight as `cnt + 1` so Dijkstra directly gives the fewest moves to reach every original node.
- Reachable subdivision nodes on an edge are computed post-hoc from each endpoint's leftover budget, capped by `cnt` to avoid double counting when both ends can reach into the same edge.
- This pattern — "shortest path on a compressed graph, then expand counts along edges" — generalizes to any problem with edge-embedded intermediate points.
