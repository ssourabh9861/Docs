# Split Array Largest Sum

**Difficulty:** Hard · **Pattern:** Binary search on the answer + greedy feasibility check · [LeetCode #410](https://leetcode.com/problems/split-array-largest-sum/)

## Problem

Given an integer array `nums` and an integer `m`, split `nums` into `m` non-empty
contiguous subarrays so as to **minimize the largest sum** among the subarrays. Return
that minimized largest sum.

## Examples

**Example 1**
```
Input:  nums = [7,2,5,10,8], m = 2
Output: 18
Explanation: Split into [7,2,5] and [10,8]; sums are 14 and 18, max is 18 — the best
possible split.
```

**Example 2**
```
Input:  nums = [1,2,3,4,5], m = 2
Output: 9
Explanation: Split into [1,2,3] and [4,5], sums 6 and 9.
```

## Constraints
- `1 <= nums.length <= 1000`
- `0 <= nums[i] <= 10^6`
- `1 <= m <= min(50, nums.length)`

## Approach 1 — DP with prefix sums

**Idea.** Let `dp[i][j]` = minimum possible "largest sum" when splitting the first `i`
elements into `j` parts. Use a prefix sum array to get any range sum in `O(1)`:

```
dp[i][j] = min over p < i of max(dp[p][j-1], prefixSum(p, i))
```

**Complexity.** Time `O(n² · m)`, Space `O(n · m)`.

```java
import java.util.Arrays;

public int splitArray(int[] nums, int m) {
    int n = nums.length;
    long[] prefix = new long[n + 1];
    for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];

    long[][] dp = new long[n + 1][m + 1];
    for (long[] row : dp) Arrays.fill(row, Long.MAX_VALUE);
    dp[0][0] = 0;

    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= Math.min(i, m); j++) {
            for (int p = j - 1; p < i; p++) {
                if (dp[p][j - 1] == Long.MAX_VALUE) continue;
                long cur = Math.max(dp[p][j - 1], prefix[i] - prefix[p]);
                dp[i][j] = Math.min(dp[i][j], cur);
            }
        }
    }
    return (int) dp[n][m];
}
```

## Approach 2 — Binary search on the answer + greedy check (optimal)

**Idea.** Binary search over the candidate "largest sum" `x`, ranging from
`max(nums)` (can't split any single element further) to `sum(nums)` (the whole array as
one part). For a candidate `x`, greedily walk the array accumulating a running sum into
the current part; whenever adding the next element would exceed `x`, close the current
part and start a new one. `x` is feasible iff the resulting number of parts is `<= m`.
Feasibility is monotonic in `x` (a larger cap is never harder to satisfy), so binary
search finds the smallest feasible `x`.

**Complexity.** Time `O(n · log(sum(nums)))`, Space `O(1)`.

```java
public int splitArray(int[] nums, int m) {
    long lo = 0, hi = 0;
    for (int x : nums) {
        lo = Math.max(lo, x);
        hi += x;
    }

    while (lo < hi) {
        long mid = lo + (hi - lo) / 2;
        if (canSplit(nums, m, mid)) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    return (int) lo;
}

private boolean canSplit(int[] nums, int m, long maxAllowed) {
    int parts = 1;
    long cur = 0;
    for (int x : nums) {
        if (cur + x > maxAllowed) {
            parts++;
            cur = x;
            if (parts > m) return false;
        } else {
            cur += x;
        }
    }
    return true;
}
```

## Key Takeaways
- "Minimize the maximum" (or "maximize the minimum") over a partition/allocation is the
  classic signal for **binary search on the answer** paired with a greedy or
  prefix-sum-based feasibility check.
- The greedy check is valid only because feasibility is monotonic in the cap `x` —
  proving that monotonicity is the key step before reaching for binary search.
- Same pattern: *Capacity To Ship Packages Within D Days*, *Koko Eating Bananas*,
  *Painter's Partition Problem* — all "binary search on the answer + greedy simulate".
