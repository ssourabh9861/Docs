# Path with Maximum Probability

**Difficulty:** Medium · **Pattern:** Dijkstra maximizing products (max-heap variant) · [LeetCode](https://leetcode.com/problems/path-with-maximum-probability/)

## Problem
Given an undirected graph with edge success probabilities, and start/end nodes, find the path that maximizes the product of edge probabilities. Return that maximum probability, or `0` if no path exists.

## Examples
**Example 1**
```
Input:  n = 3, edges = [[0,1],[1,2],[0,2]], succProb = [0.5,0.5,0.2], start = 0, end = 2
Output: 0.25000
Explanation: Path 0 -> 1 -> 2 has probability 0.5 * 0.5 = 0.25, higher than the direct edge 0 -> 2 (0.2).
```

## Constraints
- `2 <= n <= 10^4`
- `0 <= edges.length <= 2 * 10^4`
- `succProb.length == edges.length`
- `0 <= succProb[i] <= 1`
- `0 <= start, end < n`, `start != end`

## Approach 1 — Bellman-Ford style relaxation (simple, no heap)
**Idea.** Since probabilities multiply and are all `<= 1`, "shortest path" becomes "maximum product path." Relax every edge repeatedly (up to `n-1` rounds), keeping `prob[node]` as the best probability found so far, updating whenever `prob[u] * p > prob[v]`.
**Complexity.** Time O(n · E), Space O(n + E).
```java
class Solution {
    public double maxProbability(int n, int[][] edges, double[] succProb, int start, int end) {
        double[] prob = new double[n];
        prob[start] = 1.0;

        for (int iter = 0; iter < n - 1; iter++) {
            boolean changed = false;
            for (int i = 0; i < edges.length; i++) {
                int u = edges[i][0], v = edges[i][1];
                double p = succProb[i];
                if (prob[u] * p > prob[v]) {
                    prob[v] = prob[u] * p;
                    changed = true;
                }
                if (prob[v] * p > prob[u]) {
                    prob[u] = prob[v] * p;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        return prob[end];
    }
}
```

## Approach 2 — Dijkstra with a max-heap (optimal)
**Idea.** Build an adjacency list of `(neighbor, probability)`. Run Dijkstra but pop the node with the *highest* probability each time (max-heap instead of min-heap), and relax by multiplying probabilities instead of adding weights. The first time the destination is popped, its probability is final.
**Complexity.** Time O(E log V), Space O(V + E).
```java
class Solution {
    public double maxProbability(int n, int[][] edges, double[] succProb, int start, int end) {
        List<List<double[]>> graph = new ArrayList<>();
        for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
        for (int i = 0; i < edges.length; i++) {
            int u = edges[i][0], v = edges[i][1];
            double p = succProb[i];
            graph.get(u).add(new double[]{v, p});
            graph.get(v).add(new double[]{u, p});
        }

        double[] prob = new double[n];
        prob[start] = 1.0;
        PriorityQueue<double[]> pq = new PriorityQueue<>((a, b) -> Double.compare(b[1], a[1]));
        pq.offer(new double[]{start, 1.0});
        boolean[] visited = new boolean[n];

        while (!pq.isEmpty()) {
            double[] cur = pq.poll();
            int node = (int) cur[0];
            double p = cur[1];
            if (node == end) return p;
            if (visited[node]) continue;
            visited[node] = true;

            for (double[] edge : graph.get(node)) {
                int next = (int) edge[0];
                double edgeP = edge[1];
                if (!visited[next] && p * edgeP > prob[next]) {
                    prob[next] = p * edgeP;
                    pq.offer(new double[]{next, prob[next]});
                }
            }
        }
        return 0.0;
    }
}
```

## Key Takeaways
- Maximizing a product of probabilities is the same shape as minimizing a sum of weights — flip the comparator and use multiplication instead of addition.
- A max-heap Dijkstra variant is the standard trick whenever "larger is better" replaces "smaller is better" in a shortest-path formulation.
- Early-exit the moment `end` is popped from the max-heap since Dijkstra guarantees optimality at first pop when all multipliers are in `[0, 1]`.
