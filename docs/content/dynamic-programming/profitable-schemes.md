# Profitable Schemes

**Difficulty:** Hard · **Pattern:** 0/1 Knapsack with dual caps (member budget + profit floor) · [LeetCode](https://leetcode.com/problems/profitable-schemes/)

## Problem
Given `n` members available, and `group[i]`/`profit[i]` describing how many members and how much profit the `i`-th crime yields, count the number of subsets of crimes ("schemes") that use at most `n` total members and generate profit of at least `minProfit`. Return the count modulo 10^9 + 7.

## Examples
**Example 1**
```
Input:  n = 5, minProfit = 3, group = [2,2], profit = [2,3]
Output: 2
Explanation: Schemes {crime1} (2 members, profit 3) and {crime0,crime1} (4 members, profit 5) both satisfy
members <= 5 and profit >= 3.
```

**Example 2**
```
Input:  n = 10, minProfit = 5, group = [2,3,5], profit = [6,7,8]
Output: 7
```

## Constraints
- 1 <= n <= 100
- 0 <= minProfit <= 100
- 1 <= group.length <= 100
- 1 <= group[i] <= 100
- 0 <= profit[i] <= 100

## Approach 1 — 3D DP (Item by Item, Explicit)
**Idea.** This is 0/1 knapsack with two "capacity-like" dimensions: members used (an upper bound, `<= n`) and profit earned (a **lower** bound, clamp at `minProfit` since any profit beyond the floor is equally "successful"). Define `dp[k][m][p]` = number of subsets among the first `k` crimes using at most `m` members with profit **at least** `p` (where `p` is capped at `minProfit` — anything reaching or exceeding `minProfit` is bucketed at index `minProfit`). Base case `dp[0][m][0] = 1` for all `m` (the empty scheme trivially has profit >= 0). Transition per crime `k` (members `g`, profit `pr`):
`dp[k][m][p] = dp[k-1][m][p]` (skip crime k) `+ dp[k-1][m-g][max(0, p-pr)]` (take crime k, if `m >= g`).
Answer is `dp[len][n][minProfit]`.

**Complexity.** Time O(len * n * minProfit), Space O(len * n * minProfit).
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int profitableSchemes(int n, int minProfit, int[] group, int[] profit) {
        int len = group.length;
        int[][][] dp = new int[len + 1][n + 1][minProfit + 1];

        for (int m = 0; m <= n; m++) {
            dp[0][m][0] = 1;
        }

        for (int k = 1; k <= len; k++) {
            int g = group[k - 1];
            int pr = profit[k - 1];
            for (int m = 0; m <= n; m++) {
                for (int p = 0; p <= minProfit; p++) {
                    dp[k][m][p] = dp[k - 1][m][p];
                    if (m >= g) {
                        int prevP = Math.max(0, p - pr);
                        dp[k][m][p] = (dp[k][m][p] + dp[k - 1][m - g][prevP]) % MOD;
                    }
                }
            }
        }
        return dp[len][n][minProfit];
    }
}
```

## Approach 2 — 2D Rolling DP (Space-Optimized)
**Idea.** Roll away the crime-index dimension as before: `dp[m][p]` = number of schemes so far using at most `m` members with profit floor bucket `p`. Iterate members `m` backward (from `n` down to `g`) — standard 0/1 knapsack use-once trick. For profit, also iterate backward (from `minProfit` down to 0), and when adding a crime's profit, clamp the source index with `max(0, p - pr)`. Initialize `dp[m][0] = 1` for all `m` before processing any crimes.

**Complexity.** Time O(len * n * minProfit), Space O(n * minProfit).
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int profitableSchemes(int n, int minProfit, int[] group, int[] profit) {
        int[][] dp = new int[n + 1][minProfit + 1];
        for (int m = 0; m <= n; m++) {
            dp[m][0] = 1;
        }

        for (int k = 0; k < group.length; k++) {
            int g = group[k];
            int pr = profit[k];
            for (int m = n; m >= g; m--) {
                for (int p = minProfit; p >= 0; p--) {
                    int prevP = Math.max(0, p - pr);
                    dp[m][p] = (dp[m][p] + dp[m - g][prevP]) % MOD;
                }
            }
        }
        return dp[n][minProfit];
    }
}
```

## Key Takeaways
- Two-dimensional knapsack with mixed semantics: member count is a "use at most" cap, profit is a "reach at least" floor — clamp the profit index at `minProfit` so overshooting profit is bucketed together.
- Base case `dp[m][0] = 1` for every member count reflects that "do nothing" always satisfies a profit requirement of 0 (or is the seed for building up higher profit floors).
- Backward iteration on both member and profit dimensions preserves the 0/1 (use each crime once) invariant, identical in spirit to Ones and Zeroes.
