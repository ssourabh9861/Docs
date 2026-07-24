# Critical Connections in a Network

**Difficulty:** Hard · **Pattern:** Tarjan's bridge-finding algorithm (DFS with discovery/low-link times) · [LeetCode](https://leetcode.com/problems/critical-connections-in-a-network/)

## Problem
Given `n` servers connected by `connections` (an undirected graph), find all **bridges** — connections that, if removed, would disconnect the network (i.e., no other path exists between their endpoints).

## Examples
**Example 1**
```
Input:  n = 4, connections = [[0,1],[1,2],[2,0],[1,3]]
Output: [[1,3]]
Explanation: Removing 1-3 disconnects server 3 from the rest. Edges 0-1, 1-2, 2-0 form a cycle, so none of them is a bridge.
```

## Constraints
- `1 <= n <= 10^5`
- `n - 1 <= connections.length <= 10^5`
- `0 <= a_i, b_i < n`, `a_i != b_i`
- No repeated connections.

## Approach 1 — Naive edge removal + connectivity check
**Idea.** For each edge, remove it temporarily, then run a DFS/BFS from any node to check whether all `n` nodes are still reachable. If not, that edge is a bridge. Simple to reason about but far too slow for the given constraints; included as a baseline before Tarjan's.
**Complexity.** Time O(E · (V + E)), Space O(V + E).
```java
class Solution {
    public List<List<Integer>> criticalConnections(int n, List<List<Integer>> connections) {
        List<List<Integer>> result = new ArrayList<>();
        for (int i = 0; i < connections.size(); i++) {
            List<Integer> edge = connections.get(i);
            if (isBridge(n, connections, i)) {
                result.add(edge);
            }
        }
        return result;
    }

    private boolean isBridge(int n, List<List<Integer>> connections, int skipIdx) {
        List<List<Integer>> graph = new ArrayList<>();
        for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
        for (int i = 0; i < connections.size(); i++) {
            if (i == skipIdx) continue;
            int u = connections.get(i).get(0), v = connections.get(i).get(1);
            graph.get(u).add(v);
            graph.get(v).add(u);
        }

        boolean[] visited = new boolean[n];
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(0);
        visited[0] = true;
        int count = 1;
        while (!stack.isEmpty()) {
            int node = stack.pop();
            for (int next : graph.get(node)) {
                if (!visited[next]) {
                    visited[next] = true;
                    count++;
                    stack.push(next);
                }
            }
        }
        return count != n;
    }
}
```

## Approach 2 — Tarjan's bridge-finding DFS (optimal)
**Idea.** Run one DFS tracking each node's discovery time (`disc`) and the lowest discovery time reachable via back-edges from its subtree (`low`). For a tree edge `u -> v`, if `low[v] > disc[u]`, no back-edge from `v`'s subtree reaches `u` or earlier, so `(u, v)` is a bridge. This finds all bridges in a single linear pass.
**Complexity.** Time O(V + E), Space O(V + E).
```java
class Solution {
    private List<List<Integer>> graph;
    private int[] disc, low;
    private int timer = 0;
    private List<List<Integer>> bridges;

    public List<List<Integer>> criticalConnections(int n, List<List<Integer>> connections) {
        graph = new ArrayList<>();
        for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
        for (List<Integer> c : connections) {
            int u = c.get(0), v = c.get(1);
            graph.get(u).add(v);
            graph.get(v).add(u);
        }

        disc = new int[n];
        low = new int[n];
        Arrays.fill(disc, -1);
        bridges = new ArrayList<>();

        dfs(0, -1);
        return bridges;
    }

    private void dfs(int node, int parent) {
        disc[node] = low[node] = timer++;
        for (int next : graph.get(node)) {
            if (next == parent) continue; // skip the edge back to immediate parent (handles simple graphs; safe since no repeated connections)
            if (disc[next] == -1) {
                dfs(next, node);
                low[node] = Math.min(low[node], low[next]);
                if (low[next] > disc[node]) {
                    bridges.add(Arrays.asList(node, next));
                }
            } else {
                low[node] = Math.min(low[node], disc[next]);
            }
        }
    }
}
```

## Key Takeaways
- Tarjan's bridge algorithm needs only one DFS pass with `disc`/`low` arrays — an O(V+E) improvement over the O(E·(V+E)) brute force.
- The bridge condition `low[child] > disc[node]` captures exactly "no back-edge escapes the child's subtree," meaning the tree edge is not part of any cycle.
- For `n` up to `10^5`, prefer an explicit stack-based DFS in production Java to avoid recursion-depth stack overflows on skewed graphs (the recursive version above is shown for clarity).
