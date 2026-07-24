# Split Array Largest Sum

**Difficulty:** Hard · **Pattern:** Binary search on the answer (feasibility predicate) · [LeetCode](https://leetcode.com/problems/split-array-largest-sum/)

## Problem
Given an integer array `nums` and an integer `k`, split `nums` into `k` non-empty contiguous subarrays so as to minimize the largest sum among the `k` subarrays. Return that minimized largest sum.

## Examples
**Example 1**
```
Input:  nums = [7,2,5,10,8], k = 2
Output: 18
Explanation: Split as [7,2,5] and [10,8], largest sum = 18 (the best possible).
```
**Example 2**
```
Input:  nums = [1,2,3,4,5], k = 2
Output: 9
Explanation: Split as [1,2,3,4] and [5] → max(10,5)=10; better: [1,2,3] and [4,5] → max(6,9)=9.
```

## Constraints
- `1 <= nums.length <= 1000`
- `0 <= nums[i] <= 10^6`
- `1 <= k <= min(50, nums.length)`

## Approach 1 — Brute-force DP partition
**Idea.** `dp[i][j]` = minimum possible largest-subarray-sum when splitting the first `i` elements into `j` parts. Try every previous cut point.
**Complexity.** Time O(n^2 * k), Space O(n * k).
```java
class Solution {
    public int splitArray(int[] nums, int k) {
        int n = nums.length;
        long[] prefix = new long[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];

        long[][] dp = new long[n + 1][k + 1];
        for (long[] row : dp) Arrays.fill(row, Long.MAX_VALUE);
        dp[0][0] = 0;

        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= Math.min(i, k); j++) {
                for (int p = j - 1; p < i; p++) {
                    if (dp[p][j - 1] == Long.MAX_VALUE) continue;
                    long segSum = prefix[i] - prefix[p];
                    long candidate = Math.max(dp[p][j - 1], segSum);
                    dp[i][j] = Math.min(dp[i][j], candidate);
                }
            }
        }
        return (int) dp[n][k];
    }
}
```

## Approach 2 — Binary search on the answer (optimal)
**Idea.** Binary search over the candidate "largest subarray sum" `mid`, in the range `[max(nums), sum(nums)]`. **Predicate** `canSplit(mid)`: greedily walk the array accumulating a running sum; whenever adding the next element would exceed `mid`, start a new subarray (increment a counter). `canSplit(mid)` is true iff the number of subarrays needed is `<= k`. This predicate is monotonic — a larger `mid` always needs `<= ` as many subarrays as a smaller `mid` — so binary search for the smallest feasible `mid`.
**Complexity.** Time O(n * log(sum(nums))), Space O(1).
```java
class Solution {
    public int splitArray(int[] nums, int k) {
        long lo = 0, hi = 0;
        for (int x : nums) { lo = Math.max(lo, x); hi += x; }

        while (lo < hi) {
            long mid = lo + (hi - lo) / 2;
            if (canSplit(nums, k, mid)) {
                hi = mid;       // mid is feasible, try smaller
            } else {
                lo = mid + 1;   // mid too small, need bigger cap
            }
        }
        return (int) lo;
    }

    // true if nums can be split into <= k parts each with sum <= cap
    private boolean canSplit(int[] nums, int k, long cap) {
        int parts = 1;
        long curr = 0;
        for (int x : nums) {
            if (curr + x > cap) {
                parts++;
                curr = 0;
                if (parts > k) return false;
            }
            curr += x;
        }
        return true;
    }
}
```

## Key Takeaways
- Classic "binary search on the answer": search space is the *result value* (largest sum), not an array index; feasibility check is a greedy linear scan.
- Predicate monotonicity: increasing the sum cap never increases the number of required subarrays — this is what justifies binary search instead of trying every cap.
- Search bounds: `lo = max(nums)` (any single huge element forces at least this sum), `hi = sum(nums)` (the trivial one-subarray case).
- Same template as Koko Eating Bananas and Capacity to Ship Packages Within D Days — only the predicate body changes.
