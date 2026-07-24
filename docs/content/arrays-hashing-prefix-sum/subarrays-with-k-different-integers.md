# Subarrays with K Different Integers

**Difficulty:** Hard · **Pattern:** Sliding window via atMost(K) − atMost(K−1) · [LeetCode #992](https://leetcode.com/problems/subarrays-with-k-different-integers/)

## Problem

Given an array `nums` of positive integers and an integer `k`, return the number of
contiguous subarrays that contain **exactly** `k` distinct integers.

## Examples

**Example 1**
```
Input:  nums = [1,2,1,2,3], k = 2
Output: 7
Explanation: Subarrays with exactly 2 distinct values: [1,2], [2,1], [1,2], [2,3],
[1,2,1], [2,1,2], [1,2,1,2].
```

**Example 2**
```
Input:  nums = [1,2,1,3,4], k = 3
Output: 3
Explanation: [1,2,1,3], [2,1,3], [1,3,4].
```

## Constraints
- `1 <= nums.length <= 2 * 10^4`
- `1 <= nums[i], k <= nums.length`

## Approach 1 — Brute force

**Idea.** For each left endpoint, extend the right endpoint while tracking a frequency
map of the current window. The number of distinct values only grows as the window
grows, so count the window whenever distinct count equals `k`.

**Complexity.** Time `O(n²)`, Space `O(n)`.

```java
import java.util.HashMap;
import java.util.Map;

public int subarraysWithKDistinct(int[] nums, int k) {
    int n = nums.length, count = 0;
    for (int i = 0; i < n; i++) {
        Map<Integer, Integer> freq = new HashMap<>();
        for (int j = i; j < n; j++) {
            freq.merge(nums[j], 1, Integer::sum);
            if (freq.size() == k) count++;
            if (freq.size() > k) break;
        }
    }
    return count;
}
```

## Approach 2 — atMost(K) − atMost(K−1) sliding window (optimal)

**Idea.** Counting subarrays with **exactly** `k` distinct values directly is awkward
because a valid window can shrink or grow non-monotonically. Instead compute
`atMost(k)` = number of subarrays with **at most** `k` distinct integers using a
standard two-pointer sliding window (shrink from the left whenever distinct count
exceeds `k`, then add `right - left + 1` new subarrays ending at `right`). Then

```
exactly(k) = atMost(k) - atMost(k - 1)
```

**Complexity.** Time `O(n)`, Space `O(k)`.

```java
import java.util.HashMap;
import java.util.Map;

public int subarraysWithKDistinct(int[] nums, int k) {
    return atMost(nums, k) - atMost(nums, k - 1);
}

private int atMost(int[] nums, int k) {
    if (k < 0) return 0;
    Map<Integer, Integer> freq = new HashMap<>();
    int left = 0, result = 0;
    for (int right = 0; right < nums.length; right++) {
        freq.merge(nums[right], 1, Integer::sum);
        while (freq.size() > k) {
            int leftVal = nums[left];
            freq.merge(leftVal, -1, Integer::sum);
            if (freq.get(leftVal) == 0) freq.remove(leftVal);
            left++;
        }
        result += right - left + 1;
    }
    return result;
}
```

## Key Takeaways
- "Exactly `K`" via `atMost(K) - atMost(K-1)` is a general trick for any distinct-count
  sliding-window problem — turns a non-monotonic condition into two monotonic ones.
- `right - left + 1` counts every subarray ending at `right` whose window satisfies the
  "at most" condition — the same increment used in most sliding-window counting problems.
- Related: *Longest Substring with At Most K Distinct Characters*, *Fruit Into Baskets*
  (both are direct applications of `atMost(k)`).
