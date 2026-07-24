# Sum of Subarray Ranges

**Difficulty:** Hard (rated Medium on LeetCode) · **Pattern:** monotonic stack contribution technique applied twice (min and max) · [LeetCode](https://leetcode.com/problems/sum-of-subarray-ranges/)

## Problem
The **range** of a subarray is `max(subarray) - min(subarray)`. Given an integer array `nums`, return the sum of ranges of all its contiguous subarrays.

## Examples
**Example 1**
```
Input:  nums = [1,2,3]
Output: 4
Explanation: Subarrays: [1]=0, [2]=0, [3]=0, [1,2]=1, [2,3]=1, [1,2,3]=2. Sum = 0+0+0+1+1+2 = 4.
```

**Example 2**
```
Input:  nums = [1,3,3]
Output: 4
```

## Constraints
- `1 <= nums.length <= 1000`
- `-10^9 <= nums[i] <= 10^9`

## Approach 1 — Brute Force
**Idea.** Enumerate every subarray, tracking running min and max as the right end extends, and accumulate `max - min`.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public long subArrayRanges(int[] nums) {
        int n = nums.length;
        long total = 0;
        for (int i = 0; i < n; i++) {
            int min = nums[i], max = nums[i];
            for (int j = i; j < n; j++) {
                min = Math.min(min, nums[j]);
                max = Math.max(max, nums[j]);
                total += (max - min);
            }
        }
        return total;
    }
}
```

## Approach 2 — Monotonic Stack Contribution Technique (optimal)
**Idea.** `sum(ranges) = sum(subarray maximums) - sum(subarray minimums)`. Compute each half independently with the same contribution technique used in Sum of Subarray Minimums: for every element, count how many subarrays have it as the minimum (respectively maximum) using previous/next strictly-smaller (respectively strictly/non-strictly-greater) boundaries found via a monotonic stack, then multiply the element's value by that count and sum. Subtract the min-sum from the max-sum.
**Complexity.** Time O(n) — four linear passes total (prev/next smaller, prev/next greater), Space O(n).
```java
class Solution {
    public long subArrayRanges(int[] nums) {
        return sumSubarrayMaxs(nums) - sumSubarrayMins(nums);
    }

    private long sumSubarrayMins(int[] nums) {
        int n = nums.length;
        int[] left = new int[n], right = new int[n];
        Deque<Integer> stack = new ArrayDeque<>();

        for (int i = 0; i < n; i++) {
            while (!stack.isEmpty() && nums[stack.peek()] >= nums[i]) stack.pop();
            left[i] = stack.isEmpty() ? i + 1 : i - stack.peek();
            stack.push(i);
        }
        stack.clear();
        for (int i = n - 1; i >= 0; i--) {
            while (!stack.isEmpty() && nums[stack.peek()] > nums[i]) stack.pop();
            right[i] = stack.isEmpty() ? n - i : stack.peek() - i;
            stack.push(i);
        }

        long total = 0;
        for (int i = 0; i < n; i++) total += (long) nums[i] * left[i] * right[i];
        return total;
    }

    private long sumSubarrayMaxs(int[] nums) {
        int n = nums.length;
        int[] left = new int[n], right = new int[n];
        Deque<Integer> stack = new ArrayDeque<>();

        for (int i = 0; i < n; i++) {
            while (!stack.isEmpty() && nums[stack.peek()] <= nums[i]) stack.pop();
            left[i] = stack.isEmpty() ? i + 1 : i - stack.peek();
            stack.push(i);
        }
        stack.clear();
        for (int i = n - 1; i >= 0; i--) {
            while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) stack.pop();
            right[i] = stack.isEmpty() ? n - i : stack.peek() - i;
            stack.push(i);
        }

        long total = 0;
        for (int i = 0; i < n; i++) total += (long) nums[i] * left[i] * right[i];
        return total;
    }
}
```

## Key Takeaways
- Linearity of the range formula (`max - min`) lets the problem split cleanly into two independent, already-known subroutines: Sum of Subarray Maximums and Sum of Subarray Minimums.
- Reuse the exact contribution-technique code from Sum of Subarray Minimums for the min half, and its mirror (flip `>=`/`>` to `<=`/`<`) for the max half — recognizing the symmetry avoids re-deriving the logic.
- Keep the strict/non-strict tie-break consistently asymmetric on each side (as in Sum of Subarray Minimums) to avoid double-counting subarrays with duplicate values, independently for both the min and max passes.
- Related: Sum of Subarray Minimums (the min half exactly), Largest Rectangle in Histogram (shares the previous/next smaller-element scaffolding).
