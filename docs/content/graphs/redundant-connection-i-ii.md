# Redundant Connection I/II

**Difficulty:** Medium · **Pattern:** Union-Find (DSU) — union by rank + path compression; part II adds directed two-parent / cycle disambiguation · [LeetCode](https://leetcode.com/problems/redundant-connection/)

## Problem
**I (undirected):** A tree of `n` nodes had one extra edge added, creating exactly one cycle. Given the edges in input order, find the last edge that can be removed to restore a tree.
**II (directed):** Same idea but edges are directed and the original structure is a rooted tree; the added edge may cause a node to have two parents, a cycle, or both. Return the redundant edge to remove.

## Examples
**Example 1**
```
Input:  edges = [[1,2],[1,3],[2,3]]
Output: [2,3]
Explanation: [1,2] and [1,3] plus [2,3] together create a cycle; [2,3] is the last edge that closes it.
```
**Example 2 (directed)**
```
Input:  edges = [[1,2],[2,3],[3,4],[4,1],[1,5]]
Output: [4,1]
Explanation: Node 1 has indegree 1 (only from 4), but 1->2->3->4->1 forms a cycle; removing [4,1] breaks it.
```

## Constraints
- n == edges.length, 3 <= n <= 1000
- edges[i].length == 2, 1 <= edges[i][j] <= n
- (II) The resulting graph is guaranteed to have exactly one redundant edge, and the input represents a tree with one extra directed edge

## Approach 1 — Redundant Connection I: plain Union-Find, first edge that unites already-connected nodes
**Idea.** Process edges in order; for each edge `(u, v)`, if `u` and `v` are already in the same DSU component, this edge is the one that creates a cycle — return it immediately (the problem guarantees only one). Otherwise union them.
**Complexity.** Time O(n · α(n)) ≈ O(n), Space O(n).
```java
class Solution {
    private int[] parent, rank_;

    public int[] findRedundantConnection(int[][] edges) {
        int n = edges.length;
        parent = new int[n + 1];
        rank_ = new int[n + 1];
        for (int i = 0; i <= n; i++) parent[i] = i;

        for (int[] e : edges) {
            int u = e[0], v = e[1];
            if (!union(u, v)) return e; // already connected -> redundant edge
        }
        return new int[0];
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]]; // path halving
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

## Approach 2 — Redundant Connection II: detect two-parent case, then use DSU to disambiguate (optimal)
**Idea.** In a directed near-tree, the extra edge causes one of two situations: (a) some node has indegree 2 (two candidate edges `cand1`, `cand2` — the first and second edge pointing at it), or (b) a pure cycle with no indegree-2 node. Temporarily remove `cand2` (the later of the two edges into the indegree-2 node) and run plain Union-Find over the remaining edges as undirected unions: if no cycle forms, `cand2` was the redundant edge. If a cycle still forms, `cand1` is the true redundant edge (removing it breaks the cycle). If no node ever had indegree 2, run the same union process on all edges and return the edge that first closes a cycle.
**Complexity.** Time O(n · α(n)), Space O(n).
```java
class Solution {
    private int[] parent;

    public int[] findRedundantDirectedConnection(int[][] edges) {
        int n = edges.length;
        int[] candidate1 = null, candidate2 = null;
        int[] indegreeSource = new int[n + 1]; // which edge index gave this node its parent

        // Step 1: find if any node has indegree 2
        int[] parentEdge = new int[n + 1]; // stores edge index (1-based) that set this parent, 0 = none
        for (int i = 0; i < n; i++) {
            int child = edges[i][1];
            if (parentEdge[child] != 0) {
                candidate1 = edges[parentEdge[child] - 1];
                candidate2 = edges[i];
            } else {
                parentEdge[child] = i + 1;
            }
        }

        // Step 2: try union-find ignoring candidate2 (the second offending edge)
        parent = new int[n + 1];
        for (int i = 0; i <= n; i++) parent[i] = i;

        for (int[] e : edges) {
            if (candidate2 != null && e[0] == candidate2[0] && e[1] == candidate2[1]) {
                continue; // skip the second edge into the indegree-2 node
            }
            int u = e[0], v = e[1];
            int ru = find(u), rv = find(v);
            if (ru == rv) {
                // union without skipping would form a cycle
                if (candidate1 == null) {
                    return e; // pure cycle case, no indegree-2 node
                }
                return candidate1; // indegree-2 node exists; the first edge is truly redundant
            }
            parent[rv] = ru;
        }

        // no cycle found after skipping candidate2 -> candidate2 was the redundant edge
        return candidate2;
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
}
```

## Key Takeaways
- Undirected Redundant Connection: the *first* edge that unions two already-connected nodes is always the answer, since the problem guarantees exactly one redundant edge.
- Directed Redundant Connection II has three sub-cases: pure cycle (no indegree-2 node), a redundant second parent edge that doesn't participate in a cycle, and a redundant second parent edge where removing it still leaves a cycle (so the *first* parent edge must go instead).
- Always union-by-rank (or size) with path compression for near-O(1) `find`/`union` — this DSU skeleton (`parent[]`, `find`, `union`) is reused across all Union-Find problems in this set.
