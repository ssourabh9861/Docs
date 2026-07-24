# Find Critical and Pseudo-Critical Edges in Minimum Spanning Tree

**Difficulty:** Very Hard · **Pattern:** Kruskal with DSU, edge inclusion/exclusion analysis · [LeetCode](https://leetcode.com/problems/find-critical-and-pseudo-critical-edges-in-minimum-spanning-tree/)

## Problem
Given a weighted undirected connected graph, find which edges are **critical** (removing the edge increases the MST weight, i.e. it's in every MST) and which are **pseudo-critical** (the edge is in *some* MST but not all, i.e. forcing it into the MST still achieves the minimum weight).

## Examples
**Example 1**
```
Input:  n = 5, edges = [[0,1,1],[1,2,1],[2,3,2],[0,3,2],[0,4,3],[3,4,3],[1,4,6]]
Output: [[0,1],[2,3,4,5]]
Explanation: Edges 0 and 1 are critical (removing either strictly increases MST weight); edges 2,3,4,5 are pseudo-critical (can be forced into an optimal MST).
```

## Constraints
- `2 <= n <= 100`
- `1 <= edges.length <= min(200, n*(n-1)/2)`
- `edges[i].length == 3`
- `0 <= from_i < to_i < n`
- `1 <= weight_i <= 1000`
- All edge weights are distinct.

## Approach 1 — Brute-force per-edge exclude/include with Kruskal
**Idea.** First compute the baseline MST weight. Then for each edge `i`: (1) **exclude** it, rerun Kruskal on the rest — if the graph becomes disconnected or the resulting weight is strictly greater than baseline, edge `i` is critical; (2) **include** it by forcing it into the DSU before running Kruskal on the rest — if the resulting total still equals baseline, edge `i` is pseudo-critical (this also catches critical edges, so critical is checked first).
**Complexity.** Time O(E^2 α(n)) since we rerun near-linear Kruskal once per edge, Space O(E + n).
```java
class Solution {
    public List<List<Integer>> findCriticalAndPseudoCriticalEdges(int n, int[][] edges) {
        int m = edges.length;
        Integer[] idx = new Integer[m];
        for (int i = 0; i < m; i++) idx[i] = i;
        Arrays.sort(idx, (a, b) -> edges[a][2] - edges[b][2]);

        int baseline = mstWeight(n, edges, idx, -1, -1);

        List<Integer> critical = new ArrayList<>();
        List<Integer> pseudo = new ArrayList<>();

        for (int i = 0; i < m; i++) {
            // exclude edge i
            int excluded = mstWeight(n, edges, idx, i, -1);
            if (excluded > baseline || excluded == -1) {
                critical.add(i);
                continue;
            }
            // force-include edge i
            int included = mstWeight(n, edges, idx, -1, i);
            if (included == baseline) {
                pseudo.add(i);
            }
        }

        return Arrays.asList(critical, pseudo);
    }

    // returns MST weight over n nodes using given edge order, skipping `skip` and forcing `force` first; -1 if disconnected
    private int mstWeight(int n, int[][] edges, Integer[] order, int skip, int force) {
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        int weight = 0, count = 0;

        if (force != -1) {
            union(parent, edges[force][0], edges[force][1]);
            weight += edges[force][2];
            count++;
        }
        for (int i : order) {
            if (i == skip || i == force) continue;
            int u = edges[i][0], v = edges[i][1];
            if (find(parent, u) != find(parent, v)) {
                union(parent, u, v);
                weight += edges[i][2];
                count++;
            }
        }
        return count == n - 1 ? weight : -1;
    }

    private int find(int[] parent, int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private void union(int[] parent, int a, int b) {
        int ra = find(parent, a), rb = find(parent, b);
        if (ra != rb) parent[ra] = rb;
    }
}
```

## Approach 2 — Same exclude/include strategy with a reusable DSU (optimal, cleaner constant factor)
**Idea.** Functionally identical to Approach 1, but avoids repeated Integer sorting/boxing overhead by pre-sorting edges once and pairing them with original indices via a simple `int[]{weight, u, v, originalIndex}` array, so classification only touches primitive arrays.
**Complexity.** Time O(E^2 α(n)), Space O(E + n).
```java
class Solution {
    public List<List<Integer>> findCriticalAndPseudoCriticalEdges(int n, int[][] edges) {
        int m = edges.length;
        int[][] sorted = new int[m][4]; // weight, u, v, originalIndex
        for (int i = 0; i < m; i++) {
            sorted[i] = new int[]{edges[i][2], edges[i][0], edges[i][1], i};
        }
        Arrays.sort(sorted, (a, b) -> a[0] - b[0]);

        int baseline = kruskal(n, sorted, -1, -1);
        List<Integer> critical = new ArrayList<>();
        List<Integer> pseudo = new ArrayList<>();

        for (int i = 0; i < m; i++) {
            int origIdx = sorted[i][3];
            int withoutEdge = kruskal(n, sorted, i, -1);
            if (withoutEdge > baseline || withoutEdge == -1) {
                critical.add(origIdx);
            } else {
                int withEdge = kruskal(n, sorted, -1, i);
                if (withEdge == baseline) pseudo.add(origIdx);
            }
        }
        return Arrays.asList(critical, pseudo);
    }

    private int kruskal(int n, int[][] sortedEdges, int skipPos, int forcePos) {
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        int weight = 0, count = 0;

        if (forcePos != -1) {
            int[] e = sortedEdges[forcePos];
            union(parent, e[1], e[2]);
            weight += e[0];
            count++;
        }
        for (int i = 0; i < sortedEdges.length; i++) {
            if (i == skipPos || i == forcePos) continue;
            int[] e = sortedEdges[i];
            if (find(parent, e[1]) != find(parent, e[2])) {
                union(parent, e[1], e[2]);
                weight += e[0];
                count++;
            }
        }
        return count == n - 1 ? weight : -1;
    }

    private int find(int[] parent, int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private void union(int[] parent, int a, int b) {
        int ra = find(parent, a), rb = find(parent, b);
        if (ra != rb) parent[ra] = rb;
    }
}
```

## Key Takeaways
- Critical edges are ones whose *removal* breaks optimality; pseudo-critical edges are ones whose *forced inclusion* still preserves optimality — check exclusion first since a critical edge would also "pass" a naive inclusion test.
- Since weights are distinct, the MST is unique for the full graph, which is what makes "matches baseline weight" a valid test for both classifications.
- The O(E^2) exclude/include-per-edge scan is intentional and acceptable here because `E <= 200`; it would need Tarjan-style bridge/2-edge-connectivity analysis to scale further.
