# Ones and Zeroes

**Difficulty:** Hard · **Pattern:** 0/1 Knapsack with 2D capacity (count of 0s and 1s) · [LeetCode](https://leetcode.com/problems/ones-and-zeroes/)

## Problem
Given an array of binary strings `strs` and two integers `m` and `n`, find the size of the largest subset of `strs` such that there are at most `m` 0's and `n` 1's in total across the chosen strings.

## Examples
**Example 1**
```
Input:  strs = ["10","0001","111001","1","0"], m = 5, n = 3
Output: 4
Explanation: The largest subset is {"10","0001","1","0"}: total zeros = 1+3+0+1 = 5, total ones = 1+1+1+0 = 3, both within budget.
```

**Example 2**
```
Input:  strs = ["10","0","1"], m = 1, n = 1
Output: 2
Explanation: {"0","1"} uses exactly 1 zero and 1 one.
```

## Constraints
- 1 <= strs.length <= 600
- 1 <= strs[i].length <= 100
- strs[i] consists only of '0' and '1'.
- 1 <= m, n <= 100

## Approach 1 — 3D DP (Item by Item, Explicit)
**Idea.** Each string is an "item" with a cost of `(zeros, ones)` and value 1. This is a 0/1 knapsack with two capacity dimensions. Define `dp[k][i][j]` = max subset size using the first `k` strings, with budget `i` zeros and `j` ones. Base case `dp[0][i][j] = 0` for all `i, j`. For string `k` (1-indexed) with `zeros` and `ones` counts:
`dp[k][i][j] = max(dp[k-1][i][j], 1 + dp[k-1][i - zeros][j - ones])` if `i >= zeros && j >= ones`, else just `dp[k-1][i][j]`.
Answer is `dp[len][m][n]`.

**Complexity.** Time O(len * m * n), Space O(len * m * n).
```java
class Solution {
    public int findMaxForm(String[] strs, int m, int n) {
        int len = strs.length;
        int[][][] dp = new int[len + 1][m + 1][n + 1];

        for (int k = 1; k <= len; k++) {
            int[] count = countZerosOnes(strs[k - 1]);
            int zeros = count[0], ones = count[1];
            for (int i = 0; i <= m; i++) {
                for (int j = 0; j <= n; j++) {
                    dp[k][i][j] = dp[k - 1][i][j];
                    if (i >= zeros && j >= ones) {
                        dp[k][i][j] = Math.max(dp[k][i][j], 1 + dp[k - 1][i - zeros][j - ones]);
                    }
                }
            }
        }
        return dp[len][m][n];
    }

    private int[] countZerosOnes(String s) {
        int zeros = 0, ones = 0;
        for (char c : s.toCharArray()) {
            if (c == '0') zeros++; else ones++;
        }
        return new int[]{zeros, ones};
    }
}
```

## Approach 2 — 2D Rolling DP (Space-Optimized)
**Idea.** Since `dp[k][*][*]` only depends on `dp[k-1][*][*]`, collapse the string dimension: `dp[i][j]` = max subset size achievable with budget `i` zeros, `j` ones, considering strings processed so far. For each string, iterate both `i` and `j` **backward** (from `m` down to `zeros`, `n` down to `ones`) to preserve the 0/1 (use-once) property, exactly like the 1D subset-sum rolling trick but in two dimensions: `dp[i][j] = max(dp[i][j], 1 + dp[i - zeros][j - ones])`.

**Complexity.** Time O(len * m * n), Space O(m * n).
```java
class Solution {
    public int findMaxForm(String[] strs, int m, int n) {
        int[][] dp = new int[m + 1][n + 1];

        for (String s : strs) {
            int zeros = 0, ones = 0;
            for (char c : s.toCharArray()) {
                if (c == '0') zeros++; else ones++;
            }
            for (int i = m; i >= zeros; i--) {
                for (int j = n; j >= ones; j--) {
                    dp[i][j] = Math.max(dp[i][j], 1 + dp[i - zeros][j - ones]);
                }
            }
        }
        return dp[m][n];
    }
}
```

## Key Takeaways
- This is 0/1 knapsack with two independent capacity constraints (zeros budget, ones budget) instead of one — same use-once logic, just an extra dimension.
- Backward iteration over BOTH capacity dimensions is required to prevent reusing the same string twice within one pass.
- Precompute each string's (zeros, ones) cost once; the DP itself is a direct generalization of the 1D 0/1 knapsack template.
