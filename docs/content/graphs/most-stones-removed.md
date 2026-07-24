# Most Stones Removed with Same Row or Column

**Difficulty:** Medium · **Pattern:** Union-Find (DSU) — union stones sharing a row/column, answer = stones minus number of components · [LeetCode](https://leetcode.com/problems/most-stones-removed-with-same-row-or-column/)

## Problem
Given stones at integer coordinates on a 2D plane, a stone can be removed if it shares a row or column with another *remaining* stone. Return the maximum number of stones that can be removed.

## Examples
**Example 1**
```
Input:  stones = [[0,0],[0,1],[1,0],[1,2],[2,1],[2,2]]
Output: 5
Explanation: All stones lie in one connected component (via shared rows/cols), so only 1 must remain -> remove 6-1=5.
```
**Example 2**
```
Input:  stones = [[0,0],[0,2],[1,1],[2,0],[2,2]]
Output: 3
Explanation: Two components exist: {(0,0),(0,2),(2,0),(2,2)} and {(1,1)} alone -> keep 2, remove 5-2=3.
```

## Constraints
- 1 <= stones.length <= 1000
- 0 <= stones[i][0], stones[i][1] <= 10^4
- No two stones share the same coordinates

## Approach 1 — Graph + DFS to count connected components
**Idea.** Build a graph where two stones are connected if they share a row or column (naively O(n^2) edge checks), then DFS/BFS to count connected components. Answer is `stones.length - components`.
**Complexity.** Time O(n^2), Space O(n^2) worst case for the adjacency.
```java
class Solution {
    public int removeStones(int[][] stones) {
        int n = stones.length;
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());

        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (stones[i][0] == stones[j][0] || stones[i][1] == stones[j][1]) {
                    adj.get(i).add(j);
                    adj.get(j).add(i);
                }
            }
        }

        boolean[] visited = new boolean[n];
        int components = 0;
        for (int i = 0; i < n; i++) {
            if (!visited[i]) {
                components++;
                Deque<Integer> stack = new ArrayDeque<>();
                stack.push(i);
                visited[i] = true;
                while (!stack.isEmpty()) {
                    int u = stack.pop();
                    for (int v : adj.get(u)) {
                        if (!visited[v]) { visited[v] = true; stack.push(v); }
                    }
                }
            }
        }
        return n - components;
    }
}
```

## Approach 2 — Union-Find over "row space" and "column space" (optimal, no pairwise comparison)
**Idea.** Instead of connecting stones directly to each other, union each stone's row-id and column-id in a shared DSU (encode columns as `col + 10001` to keep row/column key-spaces disjoint). Two stones end up in the same component automatically if a chain of shared rows/columns links them — no O(n^2) pairwise scan needed. The number of connected stone-components equals the number of distinct roots among the stones' row endpoints; answer is `n - distinctRoots`.
**Complexity.** Time O(n · α(n)), Space O(n).
```java
class Solution {
    private Map<Integer, Integer> parent = new HashMap<>();

    public int removeStones(int[][] stones) {
        int n = stones.length;
        for (int[] stone : stones) {
            int row = stone[0];
            int col = stone[1] + 10001; // offset to disjoint-encode columns
            union(row, col);
        }

        Set<Integer> roots = new HashSet<>();
        for (int[] stone : stones) {
            roots.add(find(stone[0]));
        }
        return n - roots.size();
    }

    private int find(int x) {
        parent.putIfAbsent(x, x);
        if (parent.get(x) != x) {
            parent.put(x, find(parent.get(x)));
        }
        return parent.get(x);
    }

    private void union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra != rb) parent.put(ra, rb);
    }
}
```

## Key Takeaways
- The answer to "max removable, one must remain per component" problems is always `total - numberOfComponents` — recognize this shape immediately.
- Unioning on shared *coordinate values* (rows and columns as DSU keys) instead of unioning stones pairwise avoids the O(n^2) edge enumeration entirely.
- Disjoint-encode the two coordinate spaces (e.g., add a large offset to columns) so a row value and column value with the same number never collide as the same DSU key.
