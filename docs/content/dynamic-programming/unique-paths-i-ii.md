# Unique Paths I & II

**Difficulty:** Medium · **Pattern:** Grid DP — count monotonic (right/down) paths, obstacles zero out cells in variant II · [LeetCode I](https://leetcode.com/problems/unique-paths/) · [LeetCode II](https://leetcode.com/problems/unique-paths-ii/)

## Problem
A robot sits at the top-left corner of an `m x n` grid and can only move right or down. Count the number of distinct paths to the bottom-right corner. In Unique Paths II, some cells contain obstacles (`1`) that the robot cannot enter; empty cells are `0`.

## Examples
**Example 1 (Unique Paths, m=3, n=7)**
```
Input:  m = 3, n = 7
Output: 28
Explanation: 28 distinct right/down paths across the empty 3x7 grid.
```

**Example 2 (Unique Paths II)**
```
Input:  obstacleGrid = [[0,0,0],[0,1,0],[0,0,0]]
Output: 2
Explanation: The obstacle at (1,1) blocks the middle path; only 2 of the 3
right/down routes survive.
```

## Constraints
- `1 <= m, n <= 100`
- `obstacleGrid[i][j]` is `0` or `1`; start and end cells may or may not be obstacles (if either is `1`, answer is 0).

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be the number of ways to reach cell `(i,j)` from the start. If `(i,j)` is an obstacle, `dp[i][j] = 0`. Otherwise `dp[i][j] = dp[i-1][j] + dp[i][j-1]`, treating out-of-bounds neighbors as 0, with `dp[0][0] = 1` when the start is not blocked. Plain Unique Paths I is this same recurrence with an all-zero obstacle grid.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int uniquePathsWithObstacles(int[][] obstacleGrid) {
        int m = obstacleGrid.length, n = obstacleGrid[0].length;
        int[][] dp = new int[m][n];
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (obstacleGrid[i][j] == 1) {
                    dp[i][j] = 0;
                } else if (i == 0 && j == 0) {
                    dp[i][j] = 1;
                } else {
                    int fromTop = (i > 0) ? dp[i - 1][j] : 0;
                    int fromLeft = (j > 0) ? dp[i][j - 1] : 0;
                    dp[i][j] = fromTop + fromLeft;
                }
            }
        }
        return dp[m - 1][n - 1];
    }

    // Unique Paths I is the special case with no obstacles.
    public int uniquePaths(int m, int n) {
        return uniquePathsWithObstacles(new int[m][n]);
    }
}
```

## Approach 2 — Rolling 1D array (space optimized)
**Idea.** Each cell only needs the value directly above (previous row, same column, still in the array before it is overwritten) and directly left (already updated in the current row). A single length-`n` array suffices if we sweep left to right, row by row.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public int uniquePathsWithObstacles(int[][] obstacleGrid) {
        int m = obstacleGrid.length, n = obstacleGrid[0].length;
        int[] dp = new int[n];
        dp[0] = (obstacleGrid[0][0] == 1) ? 0 : 1;
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (obstacleGrid[i][j] == 1) {
                    dp[j] = 0;
                } else if (j > 0) {
                    dp[j] += dp[j - 1];
                }
                // j == 0, not an obstacle: dp[j] already holds the value carried from the row above.
            }
        }
        return dp[n - 1];
    }
}
```

## Key Takeaways
- Right/down-only movement means path count is a pure prefix-sum recurrence — no need to track which path was taken.
- An obstacle simply forces `dp = 0`, which then propagates zero-contribution downstream automatically.
- The 1D rolling array works because updates happen in the same left-to-right, top-to-bottom order the recurrence needs.
