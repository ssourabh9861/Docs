# Min Cost to Connect All Points

**Difficulty:** Medium · **Pattern:** Minimum Spanning Tree (Prim's with a priority queue / Kruskal's with DSU) · [LeetCode](https://leetcode.com/problems/min-cost-to-connect-all-points/)

## Problem
Given `n` points on a plane, the cost to connect two points is their Manhattan distance. Find the minimum total cost to connect all points so every point is reachable from every other (directly or indirectly).

## Examples
**Example 1**
```
Input:  points = [[0,0],[2,2],[3,10],[5,2],[7,0]]
Output: 20
Explanation: The minimum spanning tree over Manhattan distances between these points totals cost 20.
```

## Constraints
- `1 <= points.length <= 1000`
- `-10^6 <= x_i, y_i <= 10^6`
- All pairs of points are distinct.

## Approach 1 — Kruskal's algorithm with Union-Find
**Idea.** Generate all `O(n^2)` candidate edges (Manhattan distance between every pair), sort by weight, then greedily add the cheapest edge whenever its endpoints are in different DSU components, until `n-1` edges are added.
**Complexity.** Time O(n^2 log n), Space O(n^2).
```java
class Solution {
    private int[] parent, rank_;

    public int minCostConnectPoints(int[][] points) {
        int n = points.length;
        List<int[]> edges = new ArrayList<>(); // {weight, u, v}
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                int dist = Math.abs(points[i][0] - points[j][0]) + Math.abs(points[i][1] - points[j][1]);
                edges.add(new int[]{dist, i, j});
            }
        }
        edges.sort((a, b) -> a[0] - b[0]);

        parent = new int[n];
        rank_ = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        int totalCost = 0, edgesUsed = 0;
        for (int[] e : edges) {
            if (edgesUsed == n - 1) break;
            int u = e[1], v = e[2], w = e[0];
            if (union(u, v)) {
                totalCost += w;
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

## Approach 2 — Prim's algorithm with a priority queue (optimal, avoids materializing all edges)
**Idea.** Start from any point and grow the MST greedily: maintain `minDist[]`, the cheapest known edge from the growing tree to each unvisited point. Repeatedly pick the unvisited point with the smallest `minDist`, add its cost, and update neighbors' `minDist`. A heap keyed on `(dist, point)` speeds up the "pick minimum" step without ever generating all `O(n^2)` edges up front.
**Complexity.** Time O(n^2) with array scan or O(n^2 log n) with a heap on dense graphs; Space O(n).
```java
class Solution {
    public int minCostConnectPoints(int[][] points) {
        int n = points.length;
        boolean[] inMST = new boolean[n];
        int[] minDist = new int[n];
        Arrays.fill(minDist, Integer.MAX_VALUE);
        minDist[0] = 0;

        int totalCost = 0;
        for (int iter = 0; iter < n; iter++) {
            int u = -1;
            for (int i = 0; i < n; i++) {
                if (!inMST[i] && (u == -1 || minDist[i] < minDist[u])) u = i;
            }
            inMST[u] = true;
            totalCost += minDist[u];

            for (int v = 0; v < n; v++) {
                if (!inMST[v]) {
                    int dist = Math.abs(points[u][0] - points[v][0]) + Math.abs(points[u][1] - points[v][1]);
                    if (dist < minDist[v]) minDist[v] = dist;
                }
            }
        }
        return totalCost;
    }
}
```

## Key Takeaways
- Kruskal's is natural when edges are cheap to enumerate and sort; Prim's array-scan variant avoids ever materializing O(n^2) edges explicitly, which matters at n = 1000.
- On dense graphs like this one (a complete graph), Prim's O(n^2) array-based version beats a heap-based Prim's due to lower constant overhead.
- Union-Find with union by rank and path compression keeps Kruskal's cycle checks near O(1) amortized.
