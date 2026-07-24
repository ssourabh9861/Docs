# Subarrays with K Different Integers

**Difficulty:** Hard · **Pattern:** atMost(k) - atMost(k-1) trick for "exactly k" · [LeetCode](https://leetcode.com/problems/subarrays-with-k-different-integers/)

## Problem
Given an array `nums` and an integer `k`, count the number of contiguous subarrays that contain exactly `k` distinct integers.

## Examples
**Example 1**
```
Input:  nums = [1,2,1,2,3], k = 2
Output: 7
Explanation: Subarrays with exactly 2 distinct values: [1,2], [2,1], [1,2], [2,3], [1,2,1], [2,1,2], [1,2,1,2].
```
**Example 2**
```
Input:  nums = [1,2,1,3,4], k = 3
Output: 3
Explanation: Subarrays with exactly 3 distinct values: [1,2,1,3], [2,1,3], [1,3,4].
```

## Constraints
- `1 <= nums.length <= 2 * 10^4`
- `1 <= nums[i], k <= nums.length`

## Approach 1 — Brute Force
**Idea.** For every start index, extend the end and maintain a frequency map to track distinct count; whenever distinct count equals `k`, increment the answer.
**Complexity.** Time O(n²), Space O(n) for the frequency map.
```java
class Solution {
    public int subarraysWithKDistinct(int[] nums, int k) {
        int n = nums.length, count = 0;
        for (int i = 0; i < n; i++) {
            java.util.Map<Integer, Integer> freq = new java.util.HashMap<>();
            for (int j = i; j < n; j++) {
                freq.merge(nums[j], 1, Integer::sum);
                if (freq.size() == k) {
                    count++;
                } else if (freq.size() > k) {
                    break;
                }
            }
        }
        return count;
    }
}
```

## Approach 2 — atMost(k) - atMost(k-1) (optimal)
**Idea.** Counting subarrays with *exactly* `k` distinct values directly is awkward because shrinking a window with a hard distinct-count target isn't monotonic in a simple way. Instead, define `atMost(k)` = number of subarrays with **at most** `k` distinct integers (a standard shrinking window: while distinct count exceeds `k`, shrink from the left; every valid window of length `L` contributes `L` subarrays ending at `right`). Then:
`exactly(k) = atMost(k) - atMost(k-1)`.
This works because "exactly k" subarrays are precisely those counted in "at most k" but not in "at most k-1".
**Complexity.** Time O(n) (two linear passes), Space O(n) for frequency arrays.
```java
class Solution {
    public int subarraysWithKDistinct(int[] nums, int k) {
        return atMost(nums, k) - atMost(nums, k - 1);
    }

    private int atMost(int[] nums, int k) {
        if (k < 0) return 0;
        int[] freq = new int[nums.length + 1];
        int left = 0, distinct = 0, count = 0;

        for (int right = 0; right < nums.length; right++) {
            if (freq[nums[right]] == 0) distinct++;
            freq[nums[right]]++;

            while (distinct > k) {
                freq[nums[left]]--;
                if (freq[nums[left]] == 0) distinct--;
                left++;
            }
            // every subarray [left..right], [left+1..right], ..., [right..right] is valid
            count += right - left + 1;
        }
        return count;
    }
}
```

## Key Takeaways
- The `atMost(k) - atMost(k-1)` trick is the standard way to turn a hard "exactly k" sliding-window problem into two easy monotonic "at most k" windows — reusable whenever the naive exact-count window isn't cleanly shrinkable.
- Classic trap: trying to maintain "exactly k distinct" directly with a single window; the window boundary for "exactly k" isn't monotonic (shrinking can both increase and decrease validity), whereas "at most k" is always monotonic.
- Related problems: Fruit Into Baskets (atMost(2) directly), Longest Substring with At Most K Distinct Characters, Count Number of Nice Subarrays (same difference-trick pattern applied to "at most k odd numbers").
