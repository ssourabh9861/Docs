# Number of Good Paths

**Difficulty:** Hard · **Pattern:** Union-Find (DSU) — sort edges/nodes by value, union incrementally, count equal-max-value pairs merging per component · [LeetCode](https://leetcode.com/problems/number-of-good-paths/)

## Problem
Given a tree with `n` nodes, each with an integer value `vals[i]`, and `edges` describing the tree. A "good path" is a path between two nodes (possibly the same node) where every node on the path has a value <= the values of the two endpoints, and the two endpoints have equal values. Count the number of good paths (unordered pairs, plus every single node counts as a trivial good path).

## Examples
**Example 1**
```
Input:  vals = [1,3,2,1,3], edges = [[0,1],[0,2],[2,3],[2,4]]
Output: 6
Explanation: Trivial paths for each of the 5 nodes (5 paths) plus the path between the two nodes valued 3 (indices 1 and 4) since node 2 (value 2) on the path between them is <= 3. Total 6.
```
**Example 2**
```
Input:  vals = [1,1,1], edges = [[0,1],[1,2]]
Output: 6
Explanation: 3 trivial paths + (0,1) + (1,2) + (0,2), since all values are equal, every pair path is good.
```

## Constraints
- n == vals.length
- 1 <= n <= 3*10^4
- 0 <= vals[i] <= 10^5
- edges.length == n - 1 (tree)

## Approach 1 — Brute force: BFS/DFS from every node, check path max
**Idea.** For every pair of nodes with equal value, BFS/DFS the unique tree path between them and confirm no intermediate node exceeds that value. Correct but far too slow.
**Complexity.** Time O(n^2) or worse (path length up to n), Space O(n).
```java
class Solution {
    public int numberOfGoodPaths(int[] vals, int[][] edges) {
        int n = vals.length;
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }

        int count = n; // trivial single-node paths
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (vals[i] == vals[j] && pathIsGood(i, j, vals, adj, n)) {
                    count++;
                }
            }
        }
        return count;
    }

    private boolean pathIsGood(int start, int end, int[] vals, List<List<Integer>> adj, int n) {
        boolean[] visited = new boolean[n];
        Deque<Integer> queue = new ArrayDeque<>();
        queue.add(start);
        visited[start] = true;
        int maxAllowed = vals[start];

        Map<Integer, Integer> parent = new HashMap<>();
        parent.put(start, -1);
        while (!queue.isEmpty()) {
            int u = queue.poll();
            if (u == end) break;
            for (int v : adj.get(u)) {
                if (!visited[v]) {
                    visited[v] = true;
                    parent.put(v, u);
                    queue.add(v);
                }
            }
        }
        // reconstruct path from end back to start, check all values <= maxAllowed
        int cur = end;
        while (cur != -1) {
            if (vals[cur] > maxAllowed) return false;
            cur = parent.getOrDefault(cur, -1);
        }
        return true;
    }
}
```

## Approach 2 — Union-Find, process nodes in increasing value order (optimal)
**Idea.** Sort nodes by value. Process edges in increasing order of `max(vals[u], vals[v])` (equivalently, process nodes by value and only add edges where both endpoints already have value <= current threshold). Maintain, per DSU root, a list of node indices that currently equal the maximum value seen so far within that component. When merging two components at the same value threshold, any node valued exactly `v` in one component can pair with any node valued exactly `v` in the other component — all such cross-pairs are good paths (since union only happens once both endpoints' values are <= v, guaranteeing the path stays under the cap). Add `count1 * count2` such pairs, then merge the "same-value" lists.
**Complexity.** Time O(n log n) for the sort + O(n α(n)) for unions, Space O(n).
```java
class Solution {
    private int[] parent, rank_;

    public int numberOfGoodPaths(int[] vals, int[][] edges) {
        int n = vals.length;
        parent = new int[n];
        rank_ = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) {
            adj.get(e[0]).add(e[1]);
            adj.get(e[1]).add(e[0]);
        }

        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> vals[a] - vals[b]);

        // sameValueNodes.get(root) = list of node indices in that component with value == current max of component
        Map<Integer, List<Integer>> sameValueNodes = new HashMap<>();
        for (int i = 0; i < n; i++) {
            sameValueNodes.put(i, new ArrayList<>(List.of(i)));
        }

        boolean[] activated = new boolean[n];
        int count = n; // trivial single-node good paths

        for (int u : order) {
            activated[u] = true;
            for (int v : adj.get(u)) {
                if (!activated[v]) continue; // only connect to already-activated (value <= vals[u]) nodes
                int ru = find(u), rv = find(v);
                if (ru == rv) continue;

                List<Integer> listU = sameValueNodes.get(ru);
                List<Integer> listV = sameValueNodes.get(rv);

                if (vals[u] == vals[v]) {
                    // every node valued vals[u] in one side pairs with every such node on the other side
                    count += listU.size() * listV.size();
                    List<Integer> merged = new ArrayList<>(listU);
                    merged.addAll(listV);
                    int newRoot = union(ru, rv);
                    sameValueNodes.put(newRoot, merged);
                } else if (vals[u] > vals[v]) {
                    int newRoot = union(ru, rv);
                    sameValueNodes.put(newRoot, listU); // keep the higher-value side's list
                } else {
                    int newRoot = union(ru, rv);
                    sameValueNodes.put(newRoot, listV);
                }
            }
        }
        return count;
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private int union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return ra;
        if (rank_[ra] < rank_[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        if (rank_[ra] == rank_[rb]) rank_[ra]++;
        return ra;
    }
}
```

## Key Takeaways
- "Process by increasing value, union only when both endpoints qualify" is the same offline-sorting DSU trick used in Kruskal's MST and many "path max constraint" problems.
- Track, per component, the set of nodes at the component's current maximum value — merging two components at a matching value threshold contributes `|listA| * |listB|` new good paths.
- When merging components with different current maxima, keep only the higher-max side's "same value" list, since lower-value nodes can no longer form a good path pair going forward (their value no longer equals the component's running max).
