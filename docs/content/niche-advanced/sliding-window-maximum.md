# Sliding Window Maximum

**Difficulty:** Hard · **Pattern:** Monotonic decreasing deque of indices · [LeetCode](https://leetcode.com/problems/sliding-window-maximum/)

## Problem
Given an array `nums` and window size `k`, return an array of the maximum value in each contiguous window of size `k` as it slides from left to right.

## Examples
**Example 1**
```
Input:  nums = [1,3,-1,-3,5,3,6,7], k = 3
Output: [3,3,5,5,6,7]
Explanation: Window [1,3,-1] -> 3, [3,-1,-3] -> 3, [-1,-3,5] -> 5, [-3,5,3] -> 5, [5,3,6] -> 6, [3,6,7] -> 7.
```

## Constraints
- 1 <= nums.length <= 10^5
- -10^4 <= nums[i] <= 10^4
- 1 <= k <= nums.length

## Approach 1 — Brute force
**Idea.** For every window of size `k`, scan all `k` elements to find the max.
**Complexity.** Time O(n·k), Space O(1) extra (excluding output).
```java
class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] res = new int[n - k + 1];
        for (int i = 0; i + k <= n; i++) {
            int max = Integer.MIN_VALUE;
            for (int j = i; j < i + k; j++) {
                max = Math.max(max, nums[j]);
            }
            res[i] = max;
        }
        return res;
    }
}
```

## Approach 2 — Monotonic deque (optimal)
**Idea.** Maintain a deque of indices whose corresponding values are strictly decreasing from front to back. For each new index `i`: pop from the back while `nums[back] <= nums[i]` (they can never be the answer again), push `i`. Pop from the front if it has fallen out of the window (`front <= i - k`). The front of the deque is always the max of the current window. Each index is pushed and popped at most once, so the total work is linear.
**Complexity.** Time O(n), Space O(k).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] res = new int[n - k + 1];
        Deque<Integer> dq = new ArrayDeque<>(); // stores indices, values decreasing
        for (int i = 0; i < n; i++) {
            // evict indices out of the window from the front
            while (!dq.isEmpty() && dq.peekFirst() <= i - k) {
                dq.pollFirst();
            }
            // evict smaller values from the back
            while (!dq.isEmpty() && nums[dq.peekLast()] <= nums[i]) {
                dq.pollLast();
            }
            dq.offerLast(i);
            if (i >= k - 1) {
                res[i - k + 1] = nums[dq.peekFirst()];
            }
        }
        return res;
    }
}
```

## Key Takeaways
- A monotonic deque keeps only "still-relevant" candidates: anything dominated by a later, larger element can never win, so it is evicted immediately.
- Front-eviction handles window expiry; back-eviction handles domination — both make each index touched O(1) amortized times.
- This deque-max pattern generalizes directly to DP problems needing "max/min over the last k states" (Constrained Subsequence Sum, Jump Game VI).
