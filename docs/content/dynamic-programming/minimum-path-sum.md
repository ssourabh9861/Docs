# Minimum Path Sum

**Difficulty:** Medium · **Pattern:** Grid DP — minimize sum along a right/down path · [LeetCode](https://leetcode.com/problems/minimum-path-sum/)

## Problem
Given an `m x n` grid of non-negative integers, find a path from top-left to bottom-right, moving only right or down, that minimizes the sum of numbers along the path.

## Examples
**Example 1**
```
Input:  grid = [[1,3,1],[1,5,1],[4,2,1]]
Output: 7
Explanation: Path 1 -> 3 -> 1 -> 1 -> 1 minimizes the sum.
```

## Constraints
- `1 <= m, n <= 200`
- `0 <= grid[i][j] <= 200`

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be the minimum cost to reach `(i,j)` from the start. `dp[i][j] = grid[i][j] + min(dp[i-1][j], dp[i][j-1])`, with the first row only reachable from the left and the first column only from above.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int minPathSum(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        int[][] dp = new int[m][n];
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (i == 0 && j == 0) {
                    dp[i][j] = grid[i][j];
                } else if (i == 0) {
                    dp[i][j] = dp[i][j - 1] + grid[i][j];
                } else if (j == 0) {
                    dp[i][j] = dp[i - 1][j] + grid[i][j];
                } else {
                    dp[i][j] = grid[i][j] + Math.min(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m - 1][n - 1];
    }
}
```

## Approach 2 — In-place on the grid (space optimized)
**Idea.** Since `dp[i][j]` only needs the already-processed cell above and to the left, accumulate directly into `grid` while scanning row by row, left to right, avoiding any extra array.
**Complexity.** Time O(m·n), Space O(1) extra.
```java
class Solution {
    public int minPathSum(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (i == 0 && j == 0) continue;
                if (i == 0) {
                    grid[i][j] += grid[i][j - 1];
                } else if (j == 0) {
                    grid[i][j] += grid[i - 1][j];
                } else {
                    grid[i][j] += Math.min(grid[i - 1][j], grid[i][j - 1]);
                }
            }
        }
        return grid[m - 1][n - 1];
    }
}
```

## Key Takeaways
- Same access pattern as Unique Paths, but the combine operator is `min(...) + cost` instead of `+`.
- In-place mutation is safe here since every cell is read exactly once before being overwritten, in a consistent scan order.
- Watch the first row/column edge cases — they have only one possible predecessor, not two.
