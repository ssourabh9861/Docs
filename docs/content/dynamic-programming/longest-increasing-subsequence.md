# Longest Increasing Subsequence

**Difficulty:** Medium · **Pattern:** 1-D DP -> Patience Sorting with Binary Search (O(n log n)) · [LeetCode](https://leetcode.com/problems/longest-increasing-subsequence/)

## Problem
Given an integer array `nums`, return the length of the longest strictly increasing subsequence (elements need not be contiguous, but must preserve relative order).

## Examples
**Example 1**
```
Input:  nums = [10,9,2,5,3,7,101,18]
Output: 4
Explanation: The longest increasing subsequence is [2,3,7,101] (or [2,3,7,18]), length 4.
```

**Example 2**
```
Input:  nums = [0,1,0,3,2,3]
Output: 4
Explanation: [0,1,2,3] has length 4.
```

## Constraints
- 1 <= nums.length <= 2500
- -10^4 <= nums[i] <= 10^4

## Approach 1 — O(n^2) DP
**Idea.** Let `dp[i]` = length of the longest increasing subsequence that ends exactly at index `i`. Base case: every `dp[i] >= 1` (the element alone). Recurrence: for each `i`, look at all `j < i`; if `nums[j] < nums[i]`, then `i` can extend the subsequence ending at `j`:
`dp[i] = max(dp[i], dp[j] + 1)` for all `j < i` with `nums[j] < nums[i]`.
The answer is `max(dp[i])` over all `i`.

**Complexity.** Time O(n^2), Space O(n).
```java
import java.util.*;

class Solution {
    public int lengthOfLIS(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        Arrays.fill(dp, 1);
        int best = 1;

        for (int i = 1; i < n; i++) {
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i]) {
                    dp[i] = Math.max(dp[i], dp[j] + 1);
                }
            }
            best = Math.max(best, dp[i]);
        }
        return best;
    }
}
```

## Approach 2 — Patience Sorting with Binary Search (Optimal)
**Idea.** Maintain an array `tails` where `tails[k]` = the smallest possible tail value of any increasing subsequence of length `k+1` found so far. For each new number `x`, binary search for the first index in `tails` that is `>= x` (lower bound, since the subsequence is strict). If found, replace `tails[idx] = x` (a smaller tail keeps future extension easier); if not found (x is larger than all tails), append `x`, extending the LIS length by 1. The final size of `tails` is the LIS length. Note `tails` itself is not necessarily a valid subsequence — only its length is meaningful.

**Complexity.** Time O(n log n), Space O(n).
```java
import java.util.*;

class Solution {
    public int lengthOfLIS(int[] nums) {
        int[] tails = new int[nums.length];
        int size = 0;

        for (int x : nums) {
            int lo = 0, hi = size;
            while (lo < hi) {
                int mid = lo + (hi - lo) / 2;
                if (tails[mid] < x) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            tails[lo] = x;
            if (lo == size) size++;
        }
        return size;
    }
}
```

## Key Takeaways
- The O(n^2) DP directly encodes "best subsequence ending here" — a template for many subsequence DPs (LIS, longest divisible subset, etc.).
- The O(n log n) version reframes the problem as patience sorting: keep the smallest tail per achievable length so future elements have the best chance to extend.
- Use `lowerBound` (first index `>= x`) for strictly increasing; use `upperBound` (first index `> x`) if non-decreasing subsequences are allowed instead.
