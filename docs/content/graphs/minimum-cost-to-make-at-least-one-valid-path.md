# Minimum Cost to Make at Least One Valid Path in a Grid

**Difficulty:** Hard · **Pattern:** 0-1 BFS (deque-based shortest path) · [LeetCode](https://leetcode.com/problems/minimum-cost-to-make-at-least-one-valid-path-in-a-grid/)

## Problem
Each cell in a grid has a direction (1=right, 2=left, 3=down, 4=up). Moving in the direction the cell points costs 0; you may instead change the sign at a cell to move in any other direction for cost 1. Find the minimum cost to travel from top-left to bottom-right.

## Examples
**Example 1**
```
Input:  grid = [[1,1,1,1],[2,2,2,2],[1,1,1,1],[2,2,2,2]]
Output: 3
Explanation: You need to modify direction 3 times to make a path from (0,0) to (3,3).
```

## Constraints
- `m == grid.length`, `n == grid[i].length`
- `1 <= m, n <= 100`
- `1 <= grid[i][j] <= 4`

## Approach 1 — Dijkstra with a priority queue
**Idea.** Model each cell as a node; the edge to the cell in the pointed direction has weight 0, and edges to the other three neighbors have weight 1. Run standard Dijkstra from `(0,0)`.
**Complexity.** Time O(m·n·log(m·n)), Space O(m·n).
```java
class Solution {
    public int minCost(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        // direction encodes 1..4 -> right, left, down, up
        int[][] dirs = {{0,1},{0,-1},{1,0},{-1,0}};
        int[][] dist = new int[m][n];
        for (int[] row : dist) Arrays.fill(row, Integer.MAX_VALUE);
        dist[0][0] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        pq.offer(new int[]{0, 0, 0});
        boolean[][] visited = new boolean[m][n];

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int cost = cur[0], r = cur[1], c = cur[2];
            if (visited[r][c]) continue;
            visited[r][c] = true;
            if (r == m - 1 && c == n - 1) return cost;

            for (int dir = 0; dir < 4; dir++) {
                int nr = r + dirs[dir][0], nc = c + dirs[dir][1];
                if (nr < 0 || nr >= m || nc < 0 || nc >= n || visited[nr][nc]) continue;
                int weight = (grid[r][c] - 1 == dir) ? 0 : 1;
                if (cost + weight < dist[nr][nc]) {
                    dist[nr][nc] = cost + weight;
                    pq.offer(new int[]{dist[nr][nc], nr, nc});
                }
            }
        }
        return dist[m - 1][n - 1];
    }
}
```

## Approach 2 — 0-1 BFS with a deque (optimal)
**Idea.** Since edge weights are only 0 or 1, a plain BFS with a deque suffices: push zero-cost transitions to the front and cost-1 transitions to the back. The first time we pop the destination its distance is final, giving linear-time performance without a heap.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int minCost(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        int[][] dirs = {{0,1},{0,-1},{1,0},{-1,0}};
        int[][] dist = new int[m][n];
        for (int[] row : dist) Arrays.fill(row, Integer.MAX_VALUE);
        dist[0][0] = 0;

        Deque<int[]> deque = new ArrayDeque<>();
        deque.offerFirst(new int[]{0, 0});

        while (!deque.isEmpty()) {
            int[] cur = deque.pollFirst();
            int r = cur[0], c = cur[1];
            int d = dist[r][c];

            for (int dir = 0; dir < 4; dir++) {
                int nr = r + dirs[dir][0], nc = c + dirs[dir][1];
                if (nr < 0 || nr >= m || nc < 0 || nc >= n) continue;
                int weight = (grid[r][c] - 1 == dir) ? 0 : 1;
                int newDist = d + weight;
                if (newDist < dist[nr][nc]) {
                    dist[nr][nc] = newDist;
                    if (weight == 0) deque.offerFirst(new int[]{nr, nc});
                    else deque.offerLast(new int[]{nr, nc});
                }
            }
        }
        return dist[m - 1][n - 1];
    }
}
```

## Key Takeaways
- When edge weights are restricted to {0, 1}, 0-1 BFS with a deque replaces Dijkstra's heap and runs in linear time.
- Front-push for zero-cost edges preserves the invariant that the deque stays sorted by distance without needing comparisons.
- Modeling "cost to redirect a sign" as an edge weight turns a grid-simulation problem into a textbook shortest-path problem.
