# Maximum Product Subarray

**Difficulty:** Medium · **Pattern:** 1-D DP tracking running min AND max (sign flips) · [LeetCode](https://leetcode.com/problems/maximum-product-subarray/)

## Problem
Given an integer array `nums`, find a contiguous subarray that has the largest product, and return that product.

## Examples
**Example 1**
```
Input:  nums = [2,3,-2,4]
Output: 6
Explanation: The subarray [2,3] has the largest product 6.
```

**Example 2**
```
Input:  nums = [-2,3,-4]
Output: 24
Explanation: [-2,3,-4] multiplies to 24 — two negatives cancel out to give the max.
```

## Constraints
- 1 <= nums.length <= 2 * 10^4
- -10 <= nums[i] <= 10
- The product of any subarray fits in a 32-bit integer.

## Approach 1 — Track Running Max and Min
**Idea.** Unlike max subarray sum, a negative number can turn the smallest (most negative) running product into the largest product. So at each index `i`, maintain `maxProd[i]` = max product of a subarray ending at `i`, and `minProd[i]` = min product of a subarray ending at `i`. Recurrence: candidates are `nums[i]` alone, `nums[i] * maxProd[i-1]`, and `nums[i] * minProd[i-1]`.
`maxProd[i] = max(nums[i], nums[i] * maxProd[i-1], nums[i] * minProd[i-1])`
`minProd[i] = min(nums[i], nums[i] * maxProd[i-1], nums[i] * minProd[i-1])`
The answer is the max over all `maxProd[i]`. If `nums[i]` is negative, the roles of max and min effectively swap, which is why both are tracked — swapping before computing (or just taking min/max over all three candidates) handles this uniformly.

**Complexity.** Time O(n), Space O(n) (as written with arrays; reducible to O(1)).
```java
class Solution {
    public int maxProduct(int[] nums) {
        int n = nums.length;
        long[] maxProd = new long[n];
        long[] minProd = new long[n];
        maxProd[0] = nums[0];
        minProd[0] = nums[0];
        long result = nums[0];

        for (int i = 1; i < n; i++) {
            long a = nums[i];
            long b = nums[i] * maxProd[i - 1];
            long c = nums[i] * minProd[i - 1];
            maxProd[i] = Math.max(a, Math.max(b, c));
            minProd[i] = Math.min(a, Math.min(b, c));
            result = Math.max(result, maxProd[i]);
        }
        return (int) result;
    }
}
```

## Approach 2 — Space-Optimized (O(1) Space)
**Idea.** Only the previous index's `maxProd`/`minProd` are needed, so roll them into two variables `curMax`/`curMin`. A clean trick: if `nums[i]` is negative, swap `curMax` and `curMin` before combining, since multiplying by a negative flips which one produces the larger result. Then update `curMax = max(nums[i], curMax * nums[i])` and `curMin = min(nums[i], curMin * nums[i])`, tracking the global best along the way.

**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int maxProduct(int[] nums) {
        int curMax = nums[0], curMin = nums[0], result = nums[0];

        for (int i = 1; i < nums.length; i++) {
            int num = nums[i];
            if (num < 0) {
                int temp = curMax;
                curMax = curMin;
                curMin = temp;
            }
            curMax = Math.max(num, curMax * num);
            curMin = Math.min(num, curMin * num);
            result = Math.max(result, curMax);
        }
        return result;
    }
}
```

## Key Takeaways
- Whenever "negative numbers can flip an optimum," track both a running max and running min — a recurring pattern beyond just products.
- Swapping max/min before combining on a negative number is equivalent to, but cleaner than, computing all three candidates and taking min/max.
- A zero in the array resets both running values to 0 naturally (since `max(num, ...)` with `num = 0` and prior products becomes 0), effectively splitting the array into independent segments.
