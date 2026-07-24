# House Robber I / II

**Difficulty:** Medium · **Pattern:** 1-D DP — include/exclude choice (II: break circular into two linear passes) · [LeetCode](https://leetcode.com/problems/house-robber/)

## Problem
Given an array of non-negative integers representing money in houses arranged in a line (I) or a circle (II), find the maximum amount that can be robbed such that no two adjacent houses are robbed.

## Examples
**Example 1 (House Robber I)**
```
Input:  nums = [1,2,3,1]
Output: 4
Explanation: Rob house 0 (1) and house 2 (3) -> 1 + 3 = 4.
```

**Example 2 (House Robber II)**
```
Input:  nums = [2,3,2]
Output: 3
Explanation: Houses are circular (house 0 and house 2 are adjacent). Robbing both ends is invalid,
so the best is robbing house 1 -> 3.
```

## Constraints
- 1 <= nums.length <= 100
- 0 <= nums[i] <= 400

## Approach 1 — Linear DP (House Robber I)
**Idea.** Let `dp[i]` = max money obtainable from the first `i` houses (0-indexed, considering houses `0..i-1`). At house `i` we either skip it (`dp[i]`) or rob it and add to the best up to `i-2`:
`dp[i] = max(dp[i-1], dp[i-2] + nums[i-1])`, with `dp[0] = 0`, `dp[1] = nums[0]`.
This is the classic "include current vs exclude current" recurrence — robbing `i` forces skipping `i-1`.

**Complexity.** Time O(n), Space O(n) (reducible to O(1)).
```java
class Solution {
    public int rob(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n + 1];
        dp[0] = 0;
        dp[1] = nums[0];
        for (int i = 2; i <= n; i++) {
            dp[i] = Math.max(dp[i - 1], dp[i - 2] + nums[i - 1]);
        }
        return dp[n];
    }
}
```

## Approach 2 — Space-Optimized + Circular Split (House Robber II)
**Idea.** Only the last two states are needed at any point, so roll `dp[i-1]`/`dp[i-2]` into two variables `prev`/`prev2`. For the circular version, house 0 and house n-1 cannot both be robbed. Split into two linear sub-problems — houses `[0, n-2]` (exclude last) and houses `[1, n-1]` (exclude first) — solve each with the O(1) linear robber, and take the max. This works because the only constraint circularity adds is "not both ends", which excluding one end each time fully covers.

**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    // House Robber I, space-optimized
    private int robLinear(int[] nums, int start, int end) {
        int prev2 = 0, prev1 = 0;
        for (int i = start; i <= end; i++) {
            int cur = Math.max(prev1, prev2 + nums[i]);
            prev2 = prev1;
            prev1 = cur;
        }
        return prev1;
    }

    // House Robber II (circular houses)
    public int rob(int[] nums) {
        int n = nums.length;
        if (n == 1) return nums[0];
        if (n == 2) return Math.max(nums[0], nums[1]);
        return Math.max(
            robLinear(nums, 0, n - 2),   // exclude last house
            robLinear(nums, 1, n - 1)    // exclude first house
        );
    }
}
```

## Key Takeaways
- The core recurrence is "take current + best two-back" vs "skip current, keep best one-back" — a template for many non-adjacent-selection problems.
- Only O(1) prior states are ever needed, so roll the array into two variables.
- Circular constraints often reduce to "solve the linear version twice, excluding one endpoint each time."
