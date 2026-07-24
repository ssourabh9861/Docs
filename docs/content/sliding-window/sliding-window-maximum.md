# Sliding Window Maximum

**Difficulty:** Hard · **Pattern:** Fixed-size window max via monotonic deque · [LeetCode](https://leetcode.com/problems/sliding-window-maximum/)

## Problem
Given an array `nums` and a window size `k`, return an array of the maximum value in each contiguous window of size `k` as it slides from left to right across `nums`.

## Examples
**Example 1**
```
Input:  nums = [1,3,-1,-3,5,3,6,7], k = 3
Output: [3,3,5,5,6,7]
Explanation: Window [1,3,-1] -> 3, [3,-1,-3] -> 3, [-1,-3,5] -> 5, [-3,5,3] -> 5, [5,3,6] -> 6, [3,6,7] -> 7.
```
**Example 2**
```
Input:  nums = [1], k = 1
Output: [1]
```

## Constraints
- `1 <= nums.length <= 10^5`
- `-10^4 <= nums[i] <= 10^4`
- `1 <= k <= nums.length`

## Approach 1 — Brute Force
**Idea.** For each window start, scan all `k` elements to find the max.
**Complexity.** Time O(n·k), Space O(1) extra (excluding output).
```java
class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] result = new int[n - k + 1];
        for (int i = 0; i <= n - k; i++) {
            int max = Integer.MIN_VALUE;
            for (int j = i; j < i + k; j++) {
                max = Math.max(max, nums[j]);
            }
            result[i] = max;
        }
        return result;
    }
}
```

## Approach 2 — Max-Heap (Lazy Deletion)
**Idea.** Push `(value, index)` pairs into a max-heap. When querying the max for a window, pop entries whose index has fallen outside the current window (lazy deletion) until the top is valid.
**Complexity.** Time O(n log n) (each element pushed/popped at most once), Space O(n).
```java
class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] result = new int[n - k + 1];
        // max-heap ordered by value, storing [value, index]
        java.util.PriorityQueue<int[]> heap = new java.util.PriorityQueue<>(
            (a, b) -> b[0] - a[0]
        );

        for (int i = 0; i < n; i++) {
            heap.offer(new int[]{nums[i], i});
            if (i >= k - 1) {
                while (heap.peek()[1] <= i - k) {
                    heap.poll();
                }
                result[i - k + 1] = heap.peek()[0];
            }
        }
        return result;
    }
}
```

## Approach 3 — Monotonic Decreasing Deque (optimal)
**Idea.** Maintain a deque of indices whose corresponding values are in strictly decreasing order. For each new index `i`: pop from the back while `nums[back] < nums[i]` (those values can never be the max again since `i` is later and larger); push `i`; pop from the front if it has fallen out of the window (`front <= i - k`). The front of the deque is always the max of the current window.
**Complexity.** Time O(n) — each index is pushed and popped at most once, Space O(k) for the deque.
```java
class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] result = new int[n - k + 1];
        java.util.Deque<Integer> deque = new java.util.ArrayDeque<>(); // stores indices

        for (int i = 0; i < n; i++) {
            // remove indices whose values are smaller than the current one
            while (!deque.isEmpty() && nums[deque.peekLast()] < nums[i]) {
                deque.pollLast();
            }
            deque.offerLast(i);

            // remove front index if it's outside the window
            if (deque.peekFirst() <= i - k) {
                deque.pollFirst();
            }

            if (i >= k - 1) {
                result[i - k + 1] = nums[deque.peekFirst()];
            }
        }
        return result;
    }
}
```

## Key Takeaways
- The monotonic deque holds *candidates* for the max, in decreasing order of value and increasing order of index; anything smaller than a later element is permanently useless and can be discarded.
- Classic trap: comparing values with `<=` instead of `<` when popping the back — using `<=` would incorrectly discard equal-valued elements that might still be needed once the current max expires.
- Related problems: Shortest Subarray with Sum at Least K (monotonic deque on prefix sums), Constrained Subsequence Sum, Jump Game VI.
