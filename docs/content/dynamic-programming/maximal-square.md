# Maximal Square

**Difficulty:** Medium · **Pattern:** Grid DP — largest square ending at each cell, via `min` of three neighbors · [LeetCode](https://leetcode.com/problems/maximal-square/)

## Problem
Given an `m x n` binary matrix, find the area of the largest square containing only `1`s.

## Examples
**Example 1**
```
Input:  matrix = [["1","0","1","0","0"],
                   ["1","0","1","1","1"],
                   ["1","1","1","1","1"],
                   ["1","0","0","1","0"]]
Output: 4
Explanation: The largest all-1 square has side 2, area 4.
```

## Constraints
- `1 <= m, n <= 300`
- `matrix[i][j]` is `'0'` or `'1'`

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be the side length of the largest square whose bottom-right corner is `(i,j)`. If `matrix[i][j] == '1'`, then `dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1` — a square can only extend as far as its tightest neighbor allows. If `matrix[i][j] == '0'`, `dp[i][j] = 0`. The answer is `max(dp)²`.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int maximalSquare(char[][] matrix) {
        int m = matrix.length, n = matrix[0].length;
        int[][] dp = new int[m][n];
        int best = 0;
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (matrix[i][j] == '1') {
                    if (i == 0 || j == 0) {
                        dp[i][j] = 1;
                    } else {
                        dp[i][j] = Math.min(dp[i - 1][j], Math.min(dp[i][j - 1], dp[i - 1][j - 1])) + 1;
                    }
                    best = Math.max(best, dp[i][j]);
                }
            }
        }
        return best * best;
    }
}
```

## Approach 2 — Rolling 1D array with a diagonal variable (space optimized)
**Idea.** Only the previous row and current row's left neighbor are needed, plus the previous row's value one column back (the diagonal) which must be cached in a temp variable before being overwritten.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public int maximalSquare(char[][] matrix) {
        int m = matrix.length, n = matrix[0].length;
        int[] dp = new int[n + 1];
        int best = 0;
        for (int i = 0; i < m; i++) {
            int prevDiag = 0; // dp[i-1][j-1] before this row overwrites it
            for (int j = 1; j <= n; j++) {
                int temp = dp[j]; // this is dp[i-1][j] before we overwrite
                if (matrix[i][j - 1] == '1') {
                    dp[j] = Math.min(dp[j], Math.min(dp[j - 1], prevDiag)) + 1;
                    best = Math.max(best, dp[j]);
                } else {
                    dp[j] = 0;
                }
                prevDiag = temp;
            }
        }
        return best * best;
    }
}
```

## Key Takeaways
- The "tightest neighbor" `min` recurrence is the signature move for square/rectangle-in-grid problems.
- Careful ordering matters in the 1D version: capture the diagonal *before* overwriting `dp[j]`, since it becomes next iteration's diagonal.
- Track the running max side length rather than post-scanning the table again.
