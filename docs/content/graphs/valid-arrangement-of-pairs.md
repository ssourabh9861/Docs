# Valid Arrangement of Pairs

**Difficulty:** Very Hard · **Pattern:** Eulerian path on a directed multigraph (Hierholzer's algorithm) · [LeetCode](https://leetcode.com/problems/valid-arrangement-of-pairs/)

## Problem
Given pairs `[start_i, end_i]`, rearrange them into a sequence where consecutive pairs chain (`end_i == start_{i+1}`). Every pair must be used exactly once. It is guaranteed at least one valid arrangement exists.

## Examples
**Example 1**
```
Input:  pairs = [[5,1],[4,5],[11,9],[9,4]]
Output: [[11,9],[9,4],[4,5],[5,1]]
Explanation: 11 -> 9 -> 4 -> 5 -> 1 chains every pair using each exactly once.
```

## Constraints
- `1 <= pairs.length <= 10^5`
- `pairs[i].length == 2`
- `0 <= start_i, end_i <= 10^9`
- `start_i != end_i`
- The input is generated so a valid arrangement exists.

## Approach 1 — Find the Eulerian start node, then Hierholzer's DFS (recursive)
**Idea.** Treat each pair as a directed edge `start -> end`; the answer is an Eulerian path over this multigraph. Compute in-degree and out-degree per node: the start node of the path is the one node with `outDegree - inDegree == 1` (if none, any node with edges works, since then an Eulerian circuit exists). Run a Hierholzer DFS consuming edges from an adjacency map, collecting nodes in post-order, then reverse.
**Complexity.** Time O(E) amortized (each edge visited once), Space O(V + E).
```java
class Solution {
    public int[][] validArrangement(int[][] pairs) {
        Map<Integer, Deque<Integer>> graph = new HashMap<>();
        Map<Integer, Integer> outDegree = new HashMap<>();
        Map<Integer, Integer> inDegree = new HashMap<>();

        for (int[] p : pairs) {
            graph.computeIfAbsent(p[0], k -> new ArrayDeque<>()).offer(p[1]);
            outDegree.merge(p[0], 1, Integer::sum);
            inDegree.merge(p[1], 1, Integer::sum);
        }

        int start = pairs[0][0];
        for (int node : outDegree.keySet()) {
            if (outDegree.getOrDefault(node, 0) - inDegree.getOrDefault(node, 0) == 1) {
                start = node;
                break;
            }
        }

        List<Integer> order = new ArrayList<>();
        dfs(start, graph, order);
        Collections.reverse(order);

        int[][] result = new int[order.size() - 1][2];
        for (int i = 0; i < result.length; i++) {
            result[i][0] = order.get(i);
            result[i][1] = order.get(i + 1);
        }
        return result;
    }

    private void dfs(int node, Map<Integer, Deque<Integer>> graph, List<Integer> order) {
        Deque<Integer> neighbors = graph.get(node);
        while (neighbors != null && !neighbors.isEmpty()) {
            int next = neighbors.poll();
            dfs(next, graph, order);
        }
        order.add(node);
    }
}
```

## Approach 2 — Iterative Hierholzer's with an explicit stack (optimal, avoids recursion depth issues)
**Idea.** Same Eulerian-path logic, but simulate the DFS with an explicit stack to safely handle up to `10^5` edges without risking a `StackOverflowError`. Pop the current top; if it still has unused outgoing edges, push the next destination; otherwise, it's finished — append it to the answer path.
**Complexity.** Time O(E), Space O(V + E).
```java
class Solution {
    public int[][] validArrangement(int[][] pairs) {
        Map<Integer, Deque<Integer>> graph = new HashMap<>();
        Map<Integer, Integer> outDegree = new HashMap<>();
        Map<Integer, Integer> inDegree = new HashMap<>();

        for (int[] p : pairs) {
            graph.computeIfAbsent(p[0], k -> new ArrayDeque<>()).offer(p[1]);
            outDegree.merge(p[0], 1, Integer::sum);
            inDegree.merge(p[1], 1, Integer::sum);
        }

        int start = pairs[0][0];
        for (int node : outDegree.keySet()) {
            if (outDegree.getOrDefault(node, 0) - inDegree.getOrDefault(node, 0) == 1) {
                start = node;
                break;
            }
        }

        List<Integer> order = new ArrayList<>();
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(start);

        while (!stack.isEmpty()) {
            int node = stack.peek();
            Deque<Integer> neighbors = graph.get(node);
            if (neighbors != null && !neighbors.isEmpty()) {
                stack.push(neighbors.poll());
            } else {
                order.add(stack.pop());
            }
        }

        Collections.reverse(order);
        int[][] result = new int[order.size() - 1][2];
        for (int i = 0; i < result.length; i++) {
            result[i][0] = order.get(i);
            result[i][1] = order.get(i + 1);
        }
        return result;
    }
}
```

## Key Takeaways
- Chaining pairs end-to-end is a directed Eulerian path — identify the correct start node via degree imbalance (`out - in == 1`) before running Hierholzer's.
- An iterative, explicit-stack Hierholzer's is preferred at this scale (`10^5` edges) since a recursive version risks stack overflow on long chains.
- The reversed post-order of the Hierholzer walk is the Eulerian path itself — the same core idea as Reconstruct Itinerary, generalized to arbitrary numeric node labels via hash maps instead of arrays.
