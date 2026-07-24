# Swim in Rising Water

**Difficulty:** Hard · **Pattern:** Minimax shortest path (Dijkstra on max-cell-value) · [LeetCode](https://leetcode.com/problems/swim-in-rising-water/)

## Problem
An `n x n` grid gives the elevation of each cell. At time `t` you may move between adjacent cells whose elevations are both `<= t`. Find the minimum time `t` so that you can swim from `(0,0)` to `(n-1,n-1)`.

## Examples
**Example 1**
```
Input:  grid = [[0,2],[1,3]]
Output: 3
Explanation: At t=3 all cells are <= 3, so a path (0,0)->(0,1) or (1,0)->(1,1) becomes available. The minimum feasible t is 3.
```

## Constraints
- `n == grid.length == grid[i].length`
- `1 <= n <= 50`
- `0 <= grid[i][j] < n^2`
- Each value in `[0, n^2 - 1]` appears exactly once.

## Approach 1 — Binary search on time + BFS feasibility
**Idea.** Feasibility of reaching the destination by time `t` is monotonic in `t`. Binary search `t` and run a BFS/DFS that only visits cells with elevation `<= t`.
**Complexity.** Time O(n^2 · log(n^2)), Space O(n^2).
```java
class Solution {
    public int swimInWater(int[][] grid) {
        int n = grid.length;
        int lo = grid[0][0], hi = n * n - 1, ans = hi;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (canSwim(grid, mid, n, dirs)) {
                ans = mid;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return ans;
    }

    private boolean canSwim(int[][] grid, int t, int n, int[][] dirs) {
        if (grid[0][0] > t) return false;
        boolean[][] visited = new boolean[n][n];
        Deque<int[]> stack = new ArrayDeque<>();
        stack.push(new int[]{0, 0});
        visited[0][0] = true;

        while (!stack.isEmpty()) {
            int[] cur = stack.pop();
            int r = cur[0], c = cur[1];
            if (r == n - 1 && c == n - 1) return true;
            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc] && grid[nr][nc] <= t) {
                    visited[nr][nc] = true;
                    stack.push(new int[]{nr, nc});
                }
            }
        }
        return false;
    }
}
```

## Approach 2 — Dijkstra on max-cell-value (optimal)
**Idea.** Define the "cost" to reach a cell as the minimum possible value of the maximum elevation encountered along any path there (including the cell itself). Run Dijkstra where relaxation takes `max(cost[cur], grid[next])`, always expanding the cheapest frontier cell first.
**Complexity.** Time O(n^2 · log(n^2)), Space O(n^2).
```java
class Solution {
    public int swimInWater(int[][] grid) {
        int n = grid.length;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
        int[][] best = new int[n][n];
        for (int[] row : best) Arrays.fill(row, Integer.MAX_VALUE);
        best[0][0] = grid[0][0];

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        pq.offer(new int[]{grid[0][0], 0, 0});
        boolean[][] visited = new boolean[n][n];

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int t = cur[0], r = cur[1], c = cur[2];
            if (visited[r][c]) continue;
            visited[r][c] = true;
            if (r == n - 1 && c == n - 1) return t;

            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc]) {
                    int newT = Math.max(t, grid[nr][nc]);
                    if (newT < best[nr][nc]) {
                        best[nr][nc] = newT;
                        pq.offer(new int[]{newT, nr, nc});
                    }
                }
            }
        }
        return -1;
    }
}
```

## Key Takeaways
- Structurally identical to Path With Minimum Effort: minimize the maximum value along a path, solved by max-edge Dijkstra or binary search + BFS.
- Union-Find offers a third approach: sort cells by elevation, union adjacent cells as they "appear," and stop when start and end are connected — useful if you prefer DSU over heaps.
- Recognize the "monotonic feasibility" signal — it always opens the door to binary search regardless of which shortest-path method you pick.
