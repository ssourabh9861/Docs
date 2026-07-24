# Shortest Subarray with Sum at Least K

**Difficulty:** Hard · **Pattern:** Prefix sums + monotonic increasing deque · [LeetCode](https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/)

## Problem
Given an integer array `nums` (which may contain negatives) and integer `k`, return the length of the shortest, non-empty, contiguous subarray with sum `>= k`, or `-1` if none exists.

## Examples
**Example 1**
```
Input:  nums = [2,-1,2], k = 3
Output: 3
Explanation: The whole array sums to 3, and no shorter subarray reaches 3.
```
**Example 2**
```
Input:  nums = [1,2], k = 4
Output: -1
Explanation: No subarray sums to at least 4.
```

## Constraints
- 1 <= nums.length <= 10^5
- -10^5 <= nums[i] <= 10^5
- 1 <= k <= 10^9

## Approach 1 — Brute force prefix sums
**Idea.** Compute prefix sums `P[0..n]`. For every pair `i < j`, `sum(i,j) = P[j] - P[i]`. Check all pairs for `P[j] - P[i] >= k` and track the minimum `j - i`.
**Complexity.** Time O(n^2), Space O(n).
```java
class Solution {
    public int shortestSubarray(int[] nums, int k) {
        int n = nums.length;
        long[] prefix = new long[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];

        int best = Integer.MAX_VALUE;
        for (int j = 0; j <= n; j++) {
            for (int i = 0; i < j; i++) {
                if (prefix[j] - prefix[i] >= k) {
                    best = Math.min(best, j - i);
                }
            }
        }
        return best == Integer.MAX_VALUE ? -1 : best;
    }
}
```

## Approach 2 — Monotonic deque over prefix sums (optimal)
**Idea.** Because negatives are allowed, sliding window alone fails (sums are not monotone). Instead work on prefix sums `P[0..n]` with a deque of indices kept in **increasing order of `P`**. For each new `j`:
1. While `P[j] - P[deque.front] >= k`, that front index can never give a shorter answer for any future `j'` (since `j` is closer), so pop it and update the best length.
2. While `P[j] <= P[deque.back]`, the back index is strictly worse than `j` for every future query (smaller prefix, further away), so pop it.
3. Push `j`.

This keeps the deque values increasing, so step 1's check can stop as soon as it fails.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int shortestSubarray(int[] nums, int k) {
        int n = nums.length;
        long[] prefix = new long[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];

        Deque<Integer> dq = new ArrayDeque<>(); // indices, prefix[] increasing
        int best = Integer.MAX_VALUE;
        for (int j = 0; j <= n; j++) {
            while (!dq.isEmpty() && prefix[j] - prefix[dq.peekFirst()] >= k) {
                best = Math.min(best, j - dq.pollFirst());
            }
            while (!dq.isEmpty() && prefix[dq.peekLast()] >= prefix[j]) {
                dq.pollLast();
            }
            dq.offerLast(j);
        }
        return best == Integer.MAX_VALUE ? -1 : best;
    }
}
```

## Key Takeaways
- With negative numbers, work on the prefix-sum array so the condition becomes a difference test `P[j] - P[i] >= k`, then apply the deque-min pattern to it.
- The deque stays increasing in value: any earlier index with a larger-or-equal prefix than a later one is useless (dominated in both length and sum potential).
- Once a front index satisfies the sum condition, pop it immediately — later `j`'s only make the window longer, so the first success is the shortest.
