# Path With Minimum Effort

**Difficulty:** Hard · **Pattern:** Minimax shortest path (Dijkstra on max-edge-weight) · [LeetCode](https://leetcode.com/problems/path-with-minimum-effort/)

## Problem
Given a grid of heights, find a path from the top-left to the bottom-right cell that minimizes the maximum absolute height-difference between two consecutive cells on the path ("effort").

## Examples
**Example 1**
```
Input:  heights = [[1,2,2],[3,8,2],[5,3,5]]
Output: 2
Explanation: Path [1,3,5,3,5] has consecutive differences [2,2,2,2]; the max (effort) is 2, the minimum possible.
```

## Constraints
- `rows == heights.length`, `columns == heights[i].length`
- `1 <= rows, columns <= 100`
- `1 <= heights[i][j] <= 10^6`

## Approach 1 — Binary search on effort + BFS/DFS feasibility check
**Idea.** The answer is monotonic: if effort `x` allows a path, so does any `x' > x`. Binary search the effort value and check feasibility with a BFS/DFS that only steps across edges whose height difference is `<= mid`.
**Complexity.** Time O(rows · cols · log(maxHeight)), Space O(rows · cols).
```java
class Solution {
    public int minimumEffortPath(int[][] heights) {
        int rows = heights.length, cols = heights[0].length;
        int lo = 0, hi = 1_000_000, ans = 0;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (canReach(heights, mid, rows, cols, dirs)) {
                ans = mid;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return ans;
    }

    private boolean canReach(int[][] heights, int limit, int rows, int cols, int[][] dirs) {
        boolean[][] visited = new boolean[rows][cols];
        Deque<int[]> stack = new ArrayDeque<>();
        stack.push(new int[]{0, 0});
        visited[0][0] = true;

        while (!stack.isEmpty()) {
            int[] cur = stack.pop();
            int r = cur[0], c = cur[1];
            if (r == rows - 1 && c == cols - 1) return true;
            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]
                        && Math.abs(heights[nr][nc] - heights[r][c]) <= limit) {
                    visited[nr][nc] = true;
                    stack.push(new int[]{nr, nc});
                }
            }
        }
        return false;
    }
}
```

## Approach 2 — Dijkstra with max-edge-weight relaxation (optimal)
**Idea.** Treat "effort to reach a cell" as the minimum possible value of the maximum edge weight seen so far on any path to it. Run Dijkstra where relaxation replaces `dist[next]` with `max(dist[cur], |diff|)` instead of summing, popping the cell with smallest effort each time.
**Complexity.** Time O(rows · cols · log(rows · cols)), Space O(rows · cols).
```java
class Solution {
    public int minimumEffortPath(int[][] heights) {
        int rows = heights.length, cols = heights[0].length;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
        int[][] effort = new int[rows][cols];
        for (int[] row : effort) Arrays.fill(row, Integer.MAX_VALUE);
        effort[0][0] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        pq.offer(new int[]{0, 0, 0}); // {effort, r, c}
        boolean[][] visited = new boolean[rows][cols];

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int e = cur[0], r = cur[1], c = cur[2];
            if (visited[r][c]) continue;
            visited[r][c] = true;
            if (r == rows - 1 && c == cols - 1) return e;

            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
                    int newEffort = Math.max(e, Math.abs(heights[nr][nc] - heights[r][c]));
                    if (newEffort < effort[nr][nc]) {
                        effort[nr][nc] = newEffort;
                        pq.offer(new int[]{newEffort, nr, nc});
                    }
                }
            }
        }
        return 0;
    }
}
```

## Key Takeaways
- "Minimize the maximum edge on a path" is a minimax shortest path — Dijkstra still works if relaxation uses `max` instead of `+`.
- Binary search + reachability check is a robust fallback pattern whenever the objective is monotonic, even without Dijkstra intuition.
- The same max-edge Dijkstra template reappears in Swim in Rising Water.
