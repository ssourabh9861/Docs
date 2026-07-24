# Connecting Cities With Minimum Cost

**Difficulty:** Medium · **Pattern:** Minimum Spanning Tree (Kruskal with DSU / Prim with PQ) · [LeetCode](https://leetcode.com/problems/connecting-cities-with-minimum-cost/)

## Problem
Given `n` cities and a list of possible connections `[city1, city2, cost]`, find the minimum total cost to connect all cities so that any two cities are reachable from each other. Return `-1` if it's impossible.

## Examples
**Example 1**
```
Input:  n = 3, connections = [[1,2,5],[1,3,6],[2,3,1]]
Output: 6
Explanation: Choosing edges (2,3,1) and (1,2,5) connects all 3 cities for total cost 6, the minimum spanning tree weight.
```

## Constraints
- `1 <= n <= 10^4`
- `1 <= connections.length <= 10^4`
- `connections[i].length == 3`
- `1 <= city1_i, city2_i <= n`
- `0 <= cost_i <= 10^5`
- `city1_i != city2_i`

## Approach 1 — Kruskal's algorithm with Union-Find
**Idea.** Sort all connections by cost ascending, then greedily union endpoints of the cheapest remaining edge whenever they belong to different components, accumulating cost. If fewer than `n-1` edges are ultimately used, the cities can't all be connected.
**Complexity.** Time O(E log E), Space O(n + E).
```java
class Solution {
    private int[] parent, rank_;

    public int minimumCost(int n, int[][] connections) {
        Arrays.sort(connections, (a, b) -> a[2] - b[2]);
        parent = new int[n + 1];
        rank_ = new int[n + 1];
        for (int i = 1; i <= n; i++) parent[i] = i;

        int totalCost = 0, edgesUsed = 0;
        for (int[] c : connections) {
            int u = c[0], v = c[1], w = c[2];
            if (union(u, v)) {
                totalCost += w;
                edgesUsed++;
                if (edgesUsed == n - 1) break;
            }
        }
        return edgesUsed == n - 1 ? totalCost : -1;
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

## Approach 2 — Prim's algorithm with a priority queue (optimal for sparse graphs)
**Idea.** Build an adjacency list, then grow a tree from node 1: push all edges from the current tree frontier into a min-heap keyed by cost, always extending via the cheapest edge that reaches a new, unvisited city. Track how many cities have joined the tree; if it never reaches `n`, return `-1`.
**Complexity.** Time O(E log E), Space O(n + E).
```java
class Solution {
    public int minimumCost(int n, int[][] connections) {
        Map<Integer, List<int[]>> graph = new HashMap<>();
        for (int[] c : connections) {
            graph.computeIfAbsent(c[0], k -> new ArrayList<>()).add(new int[]{c[1], c[2]});
            graph.computeIfAbsent(c[1], k -> new ArrayList<>()).add(new int[]{c[0], c[2]});
        }

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]); // {node, cost}
        pq.offer(new int[]{1, 0});
        boolean[] visited = new boolean[n + 1];
        int totalCost = 0, citiesConnected = 0;

        while (!pq.isEmpty() && citiesConnected < n) {
            int[] cur = pq.poll();
            int node = cur[0], cost = cur[1];
            if (visited[node]) continue;
            visited[node] = true;
            totalCost += cost;
            citiesConnected++;

            for (int[] edge : graph.getOrDefault(node, Collections.emptyList())) {
                if (!visited[edge[0]]) pq.offer(new int[]{edge[0], edge[1]});
            }
        }
        return citiesConnected == n ? totalCost : -1;
    }
}
```

## Key Takeaways
- Both Kruskal's and Prim's find the same MST weight; pick Kruskal's when edges sort cheaply, Prim's when the graph is given as an adjacency list and is sparse.
- Always verify connectivity explicitly (`edgesUsed == n-1` or `citiesConnected == n`) — an MST algorithm silently produces a spanning forest if the graph is disconnected.
- This problem is a direct MST template with 1-indexed cities; the DSU/heap logic is otherwise identical to Min Cost to Connect All Points.
