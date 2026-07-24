# Jump Game VI

**Difficulty:** Hard · **Pattern:** DP + monotonic decreasing deque (sliding window max) · [LeetCode](https://leetcode.com/problems/jump-game-vi/)

## Problem
Given an array `nums` and integer `k`, start at index 0 with score `nums[0]`. From index `i` you may jump to any index in `[i+1, i+k]`. Return the maximum total score achievable to reach the last index, where the score of a path is the sum of `nums` at every visited index.

## Examples
**Example 1**
```
Input:  nums = [1,-1,-2,4,-7,3], k = 2
Output: 7
Explanation: Path 0 -> 1 -> 3 -> 5 gives 1 + (-1) + 4 + 3 = 7.
```

## Constraints
- 1 <= nums.length <= 10^5
- -10^4 <= nums[i] <= 10^4
- 1 <= k <= nums.length

## Approach 1 — O(n·k) DP
**Idea.** `dp[i]` = best score to reach index `i`. `dp[0] = nums[0]`; for `i >= 1`, `dp[i] = nums[i] + max(dp[i-k..i-1])`. Answer is `dp[n-1]`. Computing each window max by scanning costs O(k).
**Complexity.** Time O(n·k), Space O(n).
```java
class Solution {
    public int maxResult(int[] nums, int k) {
        int n = nums.length;
        int[] dp = new int[n];
        dp[0] = nums[0];
        for (int i = 1; i < n; i++) {
            int best = Integer.MIN_VALUE;
            for (int j = Math.max(0, i - k); j < i; j++) {
                best = Math.max(best, dp[j]);
            }
            dp[i] = nums[i] + best;
        }
        return dp[n - 1];
    }
}
```

## Approach 2 — DP with monotonic deque max (optimal)
**Idea.** Same DP recurrence, but maintain a deque of indices with `dp` values in decreasing order to answer `max(dp[i-k..i-1])` in O(1) amortized. Evict expired front indices (`< i - k`), read the front as the window max, compute `dp[i]`, then evict dominated back indices before pushing `i`.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int maxResult(int[] nums, int k) {
        int n = nums.length;
        int[] dp = new int[n];
        dp[0] = nums[0];

        Deque<Integer> dq = new ArrayDeque<>(); // indices, dp values decreasing
        dq.offerLast(0);

        for (int i = 1; i < n; i++) {
            while (!dq.isEmpty() && dq.peekFirst() < i - k) {
                dq.pollFirst();
            }
            dp[i] = nums[i] + dp[dq.peekFirst()];

            while (!dq.isEmpty() && dp[dq.peekLast()] <= dp[i]) {
                dq.pollLast();
            }
            dq.offerLast(i);
        }
        return dp[n - 1];
    }
}
```

## Key Takeaways
- Structurally identical to Constrained Subsequence Sum, minus the "restart at 0" option — every index must be reachable from a real predecessor within `k`.
- The deque always contains at least one candidate (index 0's dp is pushed up front), so no null/empty check on `dp[dq.peekFirst()]` is needed after the first eviction pass.
- Whenever a DP transition is "best of a sliding window of previous DP values," reach for this deque pattern before considering segment trees or sparse tables.
