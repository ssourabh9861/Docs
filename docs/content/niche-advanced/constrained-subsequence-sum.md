# Constrained Subsequence Sum

**Difficulty:** Hard · **Pattern:** DP + monotonic decreasing deque (sliding window max) · [LeetCode](https://leetcode.com/problems/constrained-subsequence-sum/)

## Problem
Given an integer array `nums` and integer `k`, choose a subsequence such that for every two consecutive chosen indices `i < j`, `j - i <= k`. Return the maximum possible sum of such a subsequence (must contain at least one element).

## Examples
**Example 1**
```
Input:  nums = [10,2,-10,5,20], k = 2
Output: 37
Explanation: Take 10, 2, 5, 20. Gaps between chosen indices are all <= 2. Sum = 37.
```
**Example 2**
```
Input:  nums = [-1,-2,-3], k = 1
Output: -1
Explanation: Must pick at least one element; the best single element is -1.
```

## Constraints
- 1 <= k <= nums.length <= 10^5
- -10^4 <= nums[i] <= 10^4

## Approach 1 — O(n·k) DP
**Idea.** Let `dp[i]` = best sum of a valid subsequence ending exactly at index `i`. Then `dp[i] = nums[i] + max(0, max(dp[i-k..i-1]))` — you either start fresh at `i` or extend the best subsequence ending in the last `k` positions (only if that best is positive). Answer is `max(dp)`. Computing the window max naively costs O(k) per index.
**Complexity.** Time O(n·k), Space O(n).
```java
class Solution {
    public int constrainedSubsetSum(int[] nums, int k) {
        int n = nums.length;
        int[] dp = new int[n];
        int ans = Integer.MIN_VALUE;
        for (int i = 0; i < n; i++) {
            int best = 0;
            for (int j = Math.max(0, i - k); j < i; j++) {
                best = Math.max(best, dp[j]);
            }
            dp[i] = nums[i] + best;
            ans = Math.max(ans, dp[i]);
        }
        return ans;
    }
}
```

## Approach 2 — DP with monotonic deque max (optimal)
**Idea.** The window-max query `max(dp[i-k..i-1])` is exactly a sliding window maximum. Maintain a deque of indices with `dp` values in decreasing order. Before computing `dp[i]`, evict front indices that are `< i - k` (out of range). Peek the front for the best previous `dp` (clamped to `>= 0`, i.e., skip it if negative — equivalent to comparing against 0). After computing `dp[i]`, evict back indices whose `dp` value is `<= dp[i]`, then push `i`.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int constrainedSubsetSum(int[] nums, int k) {
        int n = nums.length;
        int[] dp = new int[n];
        Deque<Integer> dq = new ArrayDeque<>(); // indices, dp values decreasing
        int ans = Integer.MIN_VALUE;

        for (int i = 0; i < n; i++) {
            while (!dq.isEmpty() && dq.peekFirst() < i - k) {
                dq.pollFirst();
            }
            int best = dq.isEmpty() ? 0 : Math.max(0, dp[dq.peekFirst()]);
            dp[i] = nums[i] + best;
            ans = Math.max(ans, dp[i]);

            while (!dq.isEmpty() && dp[dq.peekLast()] <= dp[i]) {
                dq.pollLast();
            }
            dq.offerLast(i);
        }
        return ans;
    }
}
```

## Key Takeaways
- Recognize "max over a bounded-range window of a DP array" as a textbook sliding-window-maximum subproblem — reuse the deque template verbatim.
- The "extend or restart" decision (`max(0, window max)`) is what makes this a subsequence-sum-with-gap-constraint DP, same shape as Kadane's but window-bounded.
- Deque values here are `dp[j]`, not `nums[j]` — always double-check which array the deque is monotone over.
