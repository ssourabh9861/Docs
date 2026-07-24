# Subarrays with Product Less Than K

**Difficulty:** Medium · **Pattern:** Sliding window with two pointers over positive-integer array · [LeetCode](https://leetcode.com/problems/subarray-product-less-than-k/)

## Problem
Given an array of positive integers and an integer k, count the number of contiguous subarrays where the product of all elements is strictly less than k.

## Examples
**Example 1**
```
Input:  nums = [10,5,2,6], k = 100
Output: 8
Explanation: The 8 subarrays are [10], [5], [2], [6], [10,5], [5,2], [2,6], [5,2,6]. Note [10,5,2] has product 100 which is not < 100.
```
**Example 2**
```
Input:  nums = [1,2,3], k = 0
Output: 0
```

## Constraints
- 1 <= nums.length <= 3 * 10^4
- 1 <= nums[i] <= 1000
- 0 <= k <= 10^6

## Approach 1 — Brute force
**Idea.** For every starting index, extend the window rightward, multiplying as you go, and count while the running product stays below k. Stop early once the product hits or exceeds k (since all elements are positive, product only grows).
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int numSubarrayProductLessThanKBruteForce(int[] nums, int k) {
        if (k <= 1) return 0;
        int n = nums.length;
        int count = 0;
        for (int i = 0; i < n; i++) {
            long product = 1;
            for (int j = i; j < n; j++) {
                product *= nums[j];
                if (product >= k) break;
                count++;
            }
        }
        return count;
    }
}
```

## Approach 2 — Sliding window, two pointers (optimal)
**Idea.** Maintain a window [left, right] with a running product. Expand `right` one step at a time, multiplying in nums[right]. While the product is >= k, shrink from `left`, dividing it out. Because all values are positive, every subarray ending at `right` and starting anywhere from `left` to `right` has product < k, so it contributes `right - left + 1` new valid subarrays (all those ending exactly at `right`).
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int numSubarrayProductLessThanK(int[] nums, int k) {
        if (k <= 1) return 0;   // products are >= 1 since nums[i] >= 1
        int left = 0;
        long product = 1;
        int count = 0;
        for (int right = 0; right < nums.length; right++) {
            product *= nums[right];
            while (product >= k) {
                product /= nums[left];
                left++;
            }
            count += right - left + 1;
        }
        return count;
    }
}
```

## Key Takeaways
- This is a sliding-window two-pointer pattern, not the opposite-end variant: both pointers move left-to-right, `right` expanding and `left` catching up — classic for "count subarrays satisfying a monotonic property."
- The trick `count += right - left + 1` counts all subarrays ending at `right` in O(1) instead of enumerating them, because the window is contiguous.
- Relies on positive-only values so the product is monotonic as the window grows/shrinks; doesn't directly generalize if negative numbers or zeros are allowed (zero would break division-based shrinking — handle it via early-exit thinking or a k<=1 guard).
- Related problems: Minimum Size Subarray Sum, Longest Substring Without Repeating Characters (same "expand-then-shrink" shape).
