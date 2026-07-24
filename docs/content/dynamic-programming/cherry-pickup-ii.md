# Cherry Pickup II

**Difficulty:** Hard · **Pattern:** Two robots descending a grid together — DP over `(row, c1, c2)` · [LeetCode](https://leetcode.com/problems/cherry-pickup-ii/)

## Problem
Given an `m x n` grid of cherry counts, two robots start at the top row — one at column `0`, the other at column `n-1` — and both move to the next row each step, each choosing to move to column `c-1`, `c`, or `c+1`. Maximize the total cherries collected by both robots (a cell visited by both counts once).

## Examples
**Example 1**
```
Input:  grid = [[3,1,1],[2,5,1],[1,5,5],[2,1,1]]
Output: 24
Explanation: Robot 1 path collects 11, robot 2 path collects 12, robot
1's overlap cell 1 counted once: 11+12+1 = 24.
```

## Constraints
- `2 <= rows, cols <= 70`
- `0 <= grid[i][j] <= 100`

## Approach 1 — Top-down memoization on (row, c1, c2)
**Idea.** Let `dp(row, c1, c2)` be the max cherries collectible from `row` to the last row, given robot 1 is at column `c1` and robot 2 at column `c2`. Add `grid[row][c1]`, plus `grid[row][c2]` only if `c2 != c1`. Recurse over all 3×3 combinations of next columns for both robots (clamped to valid range), memoized on `(row, c1, c2)`.
**Complexity.** Time O(rows · cols²) states × 9 transitions, Space O(rows · cols²).
```java
class Solution {
    private Integer[][][] memo;
    private int[][] grid;
    private int rows, cols;

    public int cherryPickup(int[][] grid) {
        this.grid = grid;
        rows = grid.length;
        cols = grid[0].length;
        memo = new Integer[rows][cols][cols];
        return dp(0, 0, cols - 1);
    }

    private int dp(int row, int c1, int c2) {
        if (c1 < 0 || c1 >= cols || c2 < 0 || c2 >= cols) return Integer.MIN_VALUE;
        if (row == rows) return 0;
        if (memo[row][c1][c2] != null) return memo[row][c1][c2];

        int cherries = grid[row][c1];
        if (c2 != c1) cherries += grid[row][c2];

        int best = 0;
        boolean any = false;
        for (int d1 = -1; d1 <= 1; d1++) {
            for (int d2 = -1; d2 <= 1; d2++) {
                int next = dp(row + 1, c1 + d1, c2 + d2);
                if (next != Integer.MIN_VALUE) {
                    best = any ? Math.max(best, next) : next;
                    any = true;
                }
            }
        }
        int result = cherries + (any ? best : 0);
        memo[row][c1][c2] = result;
        return result;
    }
}
```

## Approach 2 — Bottom-up DP, one row array at a time (space optimized)
**Idea.** Process rows from bottom to top. `dp[c1][c2]` holds the best total from the current row downward; each row is derived purely from the row below, so only two `cols x cols` layers are ever needed.
**Complexity.** Time O(rows · cols² · 9), Space O(cols²).
```java
class Solution {
    public int cherryPickup(int[][] grid) {
        int rows = grid.length, cols = grid[0].length;
        int[][] dp = new int[cols][cols];
        for (int[] row : dp) Arrays.fill(row, 0);

        // Initialize with the last row.
        for (int c1 = 0; c1 < cols; c1++) {
            for (int c2 = 0; c2 < cols; c2++) {
                dp[c1][c2] = grid[rows - 1][c1] + (c1 != c2 ? grid[rows - 1][c2] : 0);
            }
        }

        for (int row = rows - 2; row >= 0; row--) {
            int[][] next = new int[cols][cols];
            for (int c1 = 0; c1 < cols; c1++) {
                for (int c2 = 0; c2 < cols; c2++) {
                    int best = 0;
                    for (int d1 = -1; d1 <= 1; d1++) {
                        int nc1 = c1 + d1;
                        if (nc1 < 0 || nc1 >= cols) continue;
                        for (int d2 = -1; d2 <= 1; d2++) {
                            int nc2 = c2 + d2;
                            if (nc2 < 0 || nc2 >= cols) continue;
                            best = Math.max(best, dp[nc1][nc2]);
                        }
                    }
                    int cherries = grid[row][c1] + (c1 != c2 ? grid[row][c2] : 0);
                    next[c1][c2] = cherries + best;
                }
            }
            dp = next;
        }
        return dp[0][cols - 1];
    }
}
```

## Key Takeaways
- Both robots always move in lockstep (same row each step), so `row` is a free dimension collapsible via rolling arrays — only `(c1, c2)` needs to persist.
- Dedup the shared cell exactly when `c1 == c2`, mirroring the same trick as Cherry Pickup I.
- Bounding `best` to `0` when there are no valid transitions handles the last row / edge columns cleanly.
