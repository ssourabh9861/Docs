# Optimize Water Distribution in a Village

**Difficulty:** Hard · **Pattern:** Minimum Spanning Tree with a virtual source node · [LeetCode](https://leetcode.com/problems/optimize-water-distribution-in-a-village/)

## Problem
There are `n` houses. You can build a well directly in house `i` for `wells[i-1]`, or lay a pipe between houses `i` and `j` for `cost`. Find the minimum total cost so every house has water (via its own well or a connected pipe network reaching a house with a well).

## Examples
**Example 1**
```
Input:  n = 3, wells = [1,2,2], pipes = [[1,2,1],[2,3,1]]
Output: 3
Explanation: Build a well at house 1 (cost 1), then pipe 1-2 (cost 1) and pipe 2-3 (cost 1): total 3.
```

## Constraints
- `1 <= n <= 10^4`
- `wells.length == n`
- `0 <= wells[i] <= 10^5`
- `1 <= pipes.length <= 10^4`
- `pipes[i].length == 3`
- `1 <= house1_i, house2_i <= n`, `0 <= cost_i <= 10^5`

## Approach 1 — Kruskal's MST with a virtual node 0
**Idea.** Model "building a well at house i" as a pipe from a virtual node `0` to house `i` with weight `wells[i-1]`. Now the problem is exactly "connect all n+1 nodes (0..n) at minimum cost" — a standard MST over the combined edge list of virtual-well edges and real pipes.
**Complexity.** Time O(E log E), Space O(n + E).
```java
class Solution {
    private int[] parent, rank_;

    public int minCostToSupplyWater(int n, int[] wells, int[][] pipes) {
        List<int[]> edges = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            edges.add(new int[]{0, i + 1, wells[i]}); // virtual node 0 -> house i+1
        }
        for (int[] p : pipes) {
            edges.add(new int[]{p[0], p[1], p[2]});
        }
        edges.sort((a, b) -> a[2] - b[2]);

        parent = new int[n + 1];
        rank_ = new int[n + 1];
        for (int i = 0; i <= n; i++) parent[i] = i;

        int totalCost = 0, edgesUsed = 0;
        for (int[] e : edges) {
            if (edgesUsed == n) break; // need n edges to connect n+1 nodes (including virtual node 0)
            if (union(e[0], e[1])) {
                totalCost += e[2];
                edgesUsed++;
            }
        }
        return totalCost;
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        if (rank_[ra] < rank_[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        if (rank_[ra] == rank_[rb]) rank_[ra]++;
        return true;
    }
}
```

## Approach 2 — Prim's algorithm from the virtual node (optimal, adjacency-list based)
**Idea.** Same virtual-node trick, but grow the MST with Prim's starting at node 0: every house's well cost is its initial edge weight from node 0 in the min-heap. Pop the cheapest frontier edge, mark the house connected, add its real pipe edges to the heap, and repeat until all `n` houses are connected.
**Complexity.** Time O(E log E), Space O(n + E).
```java
class Solution {
    public int minCostToSupplyWater(int n, int[] wells, int[][] pipes) {
        Map<Integer, List<int[]>> graph = new HashMap<>();
        for (int i = 0; i < n; i++) {
            graph.computeIfAbsent(0, k -> new ArrayList<>()).add(new int[]{i + 1, wells[i]});
        }
        for (int[] p : pipes) {
            graph.computeIfAbsent(p[0], k -> new ArrayList<>()).add(new int[]{p[1], p[2]});
            graph.computeIfAbsent(p[1], k -> new ArrayList<>()).add(new int[]{p[0], p[2]});
        }

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]); // {house, cost}
        pq.offer(new int[]{0, 0});
        boolean[] visited = new boolean[n + 1];
        int totalCost = 0, connected = 0;

        while (!pq.isEmpty() && connected < n + 1) {
            int[] cur = pq.poll();
            int node = cur[0], cost = cur[1];
            if (visited[node]) continue;
            visited[node] = true;
            connected++;
            if (node != 0) totalCost += cost; // node 0 is virtual, contributes no real cost

            for (int[] edge : graph.getOrDefault(node, Collections.emptyList())) {
                if (!visited[edge[0]]) pq.offer(new int[]{edge[0], edge[1]});
            }
        }
        return totalCost;
    }
}
```

## Key Takeaways
- The virtual-source trick converts "choose a well OR connect via pipe" into a pure MST problem: adding a super-node turns per-node costs into edges.
- Kruskal's needs `n` edges (not `n-1`) to span `n+1` nodes including the virtual node — an easy off-by-one to miss.
- This pattern (virtual node absorbing per-node base costs) generalizes to any "build or connect" minimization problem.
