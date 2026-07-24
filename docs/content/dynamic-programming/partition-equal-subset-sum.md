# Partition Equal Subset Sum

**Difficulty:** Medium · **Pattern:** 0/1 Knapsack — subset-sum feasibility · [LeetCode](https://leetcode.com/problems/partition-equal-subset-sum/)

## Problem
Given an integer array `nums`, determine if it can be partitioned into two subsets such that the sum of elements in both subsets is equal.

## Examples
**Example 1**
```
Input:  nums = [1,5,11,5]
Output: true
Explanation: [1,5,5] and [11] both sum to 11.
```

**Example 2**
```
Input:  nums = [1,2,3,5]
Output: false
Explanation: Total sum is 11 (odd), so it cannot be split into two equal halves.
```

## Constraints
- 1 <= nums.length <= 200
- 1 <= nums[i] <= 100

## Approach 1 — 2D 0/1 Knapsack DP
**Idea.** If the total sum is odd, equal partition is impossible. Otherwise the problem reduces to: does some subset sum to `target = totalSum / 2`? Define `dp[i][s]` = true if using the first `i` items (0/1, each used at most once) some subset sums to exactly `s`. Base case `dp[0][0] = true` (empty subset sums to 0). Recurrence per item `i` (1-indexed, value `nums[i-1]`):
`dp[i][s] = dp[i-1][s]` (skip item i) `OR (s >= nums[i-1] && dp[i-1][s - nums[i-1]])` (take item i).
Answer is `dp[n][target]`.

**Complexity.** Time O(n * target), Space O(n * target).
```java
class Solution {
    public boolean canPartition(int[] nums) {
        int total = 0;
        for (int x : nums) total += x;
        if (total % 2 != 0) return false;

        int target = total / 2;
        int n = nums.length;
        boolean[][] dp = new boolean[n + 1][target + 1];
        dp[0][0] = true;

        for (int i = 1; i <= n; i++) {
            int val = nums[i - 1];
            for (int s = 0; s <= target; s++) {
                dp[i][s] = dp[i - 1][s];
                if (s >= val && dp[i - 1][s - val]) {
                    dp[i][s] = true;
                }
            }
        }
        return dp[n][target];
    }
}
```

## Approach 2 — 1D Rolling Knapsack (Space-Optimized)
**Idea.** Since row `i` only depends on row `i-1`, collapse to a single boolean array `dp[s]` = true if some subset of items processed so far sums to `s`. Crucially, iterate `s` from `target` down to `val` for each item — this ensures each item is only used once (processing backward prevents reusing the same item's contribution from this same pass, unlike the unbounded-knapsack forward iteration).

**Complexity.** Time O(n * target), Space O(target).
```java
class Solution {
    public boolean canPartition(int[] nums) {
        int total = 0;
        for (int x : nums) total += x;
        if (total % 2 != 0) return false;

        int target = total / 2;
        boolean[] dp = new boolean[target + 1];
        dp[0] = true;

        for (int val : nums) {
            for (int s = target; s >= val; s--) {
                if (dp[s - val]) {
                    dp[s] = true;
                }
            }
        }
        return dp[target];
    }
}
```

## Key Takeaways
- "Split into two equal-sum subsets" always reduces to "does a subset sum to totalSum / 2" — a canonical 0/1 knapsack feasibility problem.
- Iterating the capacity dimension backward (high to low) is what enforces the 0/1 (each item once) constraint in the 1D rolling array; forward iteration would allow reuse (unbounded knapsack).
- Early exit: odd total sum is an immediate `false`, no DP needed.
