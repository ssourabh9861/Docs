# Burst Balloons

**Difficulty:** Hard · **Pattern:** Interval DP on "which balloon bursts last" · [LeetCode](https://leetcode.com/problems/burst-balloons/)

## Problem
Given `n` balloons with values `nums[i]`, bursting balloon `i` earns `nums[left] * nums[i] * nums[right]` coins, where `left`/`right` are the current neighbors after previous bursts. Return the maximum coins obtainable by bursting all balloons in some order.

## Examples
**Example 1**
```
Input:  nums = [3,1,5,8]
Output: 167
Explanation: Burst order 1,5,3,8 (0-indexed values) yields 3*1*5 + 3*5*8 + 1*3*8 + 1*8*1 = 167.
```
**Example 2**
```
Input:  nums = [1,5]
Output: 10
```

## Constraints
- `n == nums.length`
- `1 <= n <= 300`
- `0 <= nums[i] <= 100`

## Approach 1 — Top-down memoized recursion (think "last balloon to burst")
**Idea.** Bursting in forward order is hard because neighbors keep changing. Instead, pad `nums` with virtual `1`s at both ends and think backward: for the open interval `(i, j)` (exclusive), choose which balloon `k` strictly between them bursts **last**. Once `k` is fixed as last, everything in `(i, k)` and `(k, j)` must already be gone, so bursting `k` earns `nums[i] * nums[k] * nums[j]`, and the total is `dp[i][k] + dp[k][j] + nums[i]*nums[k]*nums[j]`. Take the best `k`, memoized by `(i, j)`.
**Complexity.** Time O(n³), Space O(n²).
```java
class Solution {
    private int[][] memo;
    private int[] balloons;

    public int maxCoins(int[] nums) {
        int n = nums.length;
        balloons = new int[n + 2];
        balloons[0] = balloons[n + 1] = 1;
        for (int i = 0; i < n; i++) balloons[i + 1] = nums[i];

        memo = new int[n + 2][n + 2];
        for (int[] row : memo) Arrays.fill(row, -1);
        return solve(0, n + 1);
    }

    private int solve(int i, int j) {
        if (i + 1 >= j) return 0;
        if (memo[i][j] != -1) return memo[i][j];

        int best = 0;
        for (int k = i + 1; k < j; k++) {
            int coins = balloons[i] * balloons[k] * balloons[j] + solve(i, k) + solve(k, j);
            best = Math.max(best, coins);
        }
        return memo[i][j] = best;
    }
}
```
*(add `import java.util.Arrays;`)*

## Approach 2 — Bottom-up interval DP (optimal ordering)
**Idea.** Same recurrence, filled iteratively by increasing gap width `j - i` so `dp[i][k]` and `dp[k][j]` (both narrower intervals) are ready before `dp[i][j]` is computed. Avoids recursion overhead entirely.
**Complexity.** Time O(n³), Space O(n²).
```java
class Solution {
    public int maxCoins(int[] nums) {
        int n = nums.length;
        int[] balloons = new int[n + 2];
        balloons[0] = balloons[n + 1] = 1;
        for (int i = 0; i < n; i++) balloons[i + 1] = nums[i];

        int[][] dp = new int[n + 2][n + 2];
        for (int gap = 2; gap <= n + 1; gap++) {
            for (int i = 0; i + gap <= n + 1; i++) {
                int j = i + gap;
                for (int k = i + 1; k < j; k++) {
                    int coins = balloons[i] * balloons[k] * balloons[j] + dp[i][k] + dp[k][j];
                    dp[i][j] = Math.max(dp[i][j], coins);
                }
            }
        }
        return dp[0][n + 1];
    }
}
```

## Key Takeaways
- Thinking about which balloon bursts *last* (not first) inside an interval is what makes the neighbors well-defined and the subproblems independent.
- Padding both ends with a virtual `1` removes special-casing for boundary balloons.
- This "choose the last event in an interval" framing recurs in Matrix Chain Multiplication and Minimum Cost to Merge Stones.
