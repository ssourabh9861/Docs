# Shortest Path in a Grid with Obstacles Elimination

**Difficulty:** Hard · **Pattern:** BFS over expanded state (row, col, remaining eliminations) · [LeetCode](https://leetcode.com/problems/shortest-path-in-a-grid-with-obstacles-elimination/)

## Problem
Given a grid of 0s (empty) and 1s (obstacles), find the minimum number of steps to go from `(0,0)` to `(m-1,n-1)` moving in 4 directions, allowed to eliminate at most `k` obstacles along the way. Return `-1` if impossible.

## Examples
**Example 1**
```
Input:  grid = [[0,0,0],[1,1,0],[0,0,0],[0,1,1],[0,0,0]], k = 1
Output: 6
Explanation: The shortest path without eliminating any obstacle is 10 steps; eliminating the obstacle at (3,2) shortens it to 6.
```

## Constraints
- `m == grid.length`, `n == grid[i].length`
- `1 <= m, n <= 40`
- `1 <= k <= m * n`
- `grid[i][j]` is 0 or 1.

## Approach 1 — BFS on state (row, col, remaining k)
**Idea.** Extend the classic grid-BFS state with how many eliminations remain. A state `(r, c, rem)` is visited once; from it, moving onto an obstacle consumes one elimination (`rem - 1`, must stay `>= 0`), moving onto an empty cell keeps `rem` the same. BFS layer number is the step count, so the first time we pop the destination is optimal.
**Complexity.** Time O(m · n · k), Space O(m · n · k).
```java
class Solution {
    public int shortestPath(int[][] grid, int k) {
        int m = grid.length, n = grid[0].length;
        if (m == 1 && n == 1) return 0;
        k = Math.min(k, m + n - 2); // eliminating more than the direct path length is never needed
        boolean[][][] visited = new boolean[m][n][k + 1];
        Queue<int[]> queue = new LinkedList<>();
        queue.offer(new int[]{0, 0, k, 0}); // r, c, remaining, steps
        visited[0][0][k] = true;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

        while (!queue.isEmpty()) {
            int[] cur = queue.poll();
            int r = cur[0], c = cur[1], rem = cur[2], steps = cur[3];
            if (r == m - 1 && c == n - 1) return steps;

            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr < 0 || nr >= m || nc < 0 || nc >= n) continue;
                int nrem = rem - grid[nr][nc];
                if (nrem < 0 || visited[nr][nc][nrem]) continue;
                visited[nr][nc][nrem] = true;
                queue.offer(new int[]{nr, nc, nrem, steps + 1});
            }
        }
        return -1;
    }
}
```

## Approach 2 — A* with Manhattan-distance heuristic (optimal, faster in practice)
**Idea.** Same state space, but use a priority queue ordered by `steps + manhattanDistanceToTarget` (an admissible heuristic since every move costs 1 and the grid has no diagonal shortcuts). This directs search toward the goal and typically visits fewer states than plain BFS while still guaranteeing the optimal answer.
**Complexity.** Time O(m · n · k · log(m · n · k)) worst case, typically much faster, Space O(m · n · k).
```java
class Solution {
    public int shortestPath(int[][] grid, int k) {
        int m = grid.length, n = grid[0].length;
        if (m == 1 && n == 1) return 0;
        k = Math.min(k, m + n - 2);
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
        int[][][] bestSteps = new int[m][n][k + 1];
        for (int[][] plane : bestSteps) for (int[] row : plane) Arrays.fill(row, Integer.MAX_VALUE);
        bestSteps[0][0][k] = 0;

        // priority: {estimatedTotal, steps, r, c, rem}
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        pq.offer(new int[]{m + n - 2, 0, 0, 0, k});

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int steps = cur[1], r = cur[2], c = cur[3], rem = cur[4];
            if (r == m - 1 && c == n - 1) return steps;
            if (steps > bestSteps[r][c][rem]) continue;

            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr < 0 || nr >= m || nc < 0 || nc >= n) continue;
                int nrem = rem - grid[nr][nc];
                if (nrem < 0) continue;
                int newSteps = steps + 1;
                if (newSteps < bestSteps[nr][nc][nrem]) {
                    bestSteps[nr][nc][nrem] = newSteps;
                    int heuristic = (m - 1 - nr) + (n - 1 - nc);
                    pq.offer(new int[]{newSteps + heuristic, newSteps, nr, nc, nrem});
                }
            }
        }
        return -1;
    }
}
```

## Key Takeaways
- When a resource (obstacle eliminations, keys, fuel) is limited, fold it into the BFS state — `(r, c, remaining)` instead of just `(r, c)`.
- Capping `k` at `m + n - 2` (the longest a shortest path could ever need) keeps the state space from blowing up unnecessarily.
- A* with Manhattan distance is a drop-in speedup over BFS for uniform-cost grid problems since the heuristic is always admissible.
