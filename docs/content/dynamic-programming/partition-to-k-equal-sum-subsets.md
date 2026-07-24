# Partition to K Equal Sum Subsets

**Difficulty:** Hard · **Pattern:** bitmask DP over subset masks, tracking used-sum-mod-target per mask · [LeetCode](https://leetcode.com/problems/partition-to-k-equal-sum-subsets/)

## Problem
Given an integer array `nums` and an integer `k`, determine whether it is possible to partition `nums` into `k` non-empty subsets whose sums are all equal.

## Examples
**Example 1**
```
Input:  nums = [4,3,2,3,5,2,4,5], k = 4
Output: true
Explanation: Total sum = 28, target per subset = 7.
             Groups: (5,2), (4,3), (3,4), (5,2) — four groups each summing to 7.
```
**Example 2**
```
Input:  nums = [1,2,3,4], k = 3
Output: false
Explanation: Total sum = 10, not divisible by 3, so equal partition is impossible.
```

## Constraints
- `1 <= k <= nums.length <= 16`
- `1 <= nums[i] <= 10^4`
- The frequency of each element is in the range `[1, 4]`.

## Approach 1 — Backtracking with k running bucket sums
**Idea.** Compute `target = sum(nums) / k` (fail fast if not integral, or if `max(nums) > target`). Sort descending (large elements prune faster). Maintain an array `buckets[k]` of current partial sums; recursively try placing each `nums[i]` into a bucket whose current sum plus `nums[i]` doesn't exceed `target`. Skip duplicate bucket sums at the same level to avoid redundant branches. This is exponential in the worst case but works within `n <= 16` thanks to pruning.

**Complexity.** Time O(k^n) worst case (heavily pruned in practice), Space O(n + k).
```java
import java.util.Arrays;

class Solution {
    public boolean canPartitionKSubsets(int[] nums, int k) {
        int sum = 0;
        for (int x : nums) sum += x;
        if (sum % k != 0) return false;
        int target = sum / k;

        Integer[] boxed = new Integer[nums.length];
        for (int i = 0; i < nums.length; i++) boxed[i] = nums[i];
        Arrays.sort(boxed, (a, b) -> b - a);
        if (boxed[0] > target) return false;

        int[] buckets = new int[k];
        return backtrack(boxed, 0, buckets, target);
    }

    private boolean backtrack(Integer[] nums, int idx, int[] buckets, int target) {
        if (idx == nums.length) return true;
        int num = nums[idx];

        for (int i = 0; i < buckets.length; i++) {
            if (buckets[i] + num > target) continue;
            // Skip trying an identical bucket state twice at this level.
            if (i > 0 && buckets[i] == buckets[i - 1]) continue;

            buckets[i] += num;
            if (backtrack(nums, idx + 1, buckets, target)) return true;
            buckets[i] -= num;

            if (buckets[i] == 0) break; // placing into an empty bucket failed; others are equivalent
        }
        return false;
    }
}
```

## Approach 2 — Bitmask DP over "used elements" subsets (optimal for n ≤ 16)
**Idea.** Let `dp[mask]` = the remainder (mod `target`) of the sum of elements in `mask`, if `mask` is reachable as a prefix of some valid partial partition sequence, else `-1` (unreachable). Formally: `dp[0] = 0`. For each reachable `mask` with current partial-bucket remainder `r = dp[mask]`, and each `i ∉ mask`, if `r + nums[i] <= target`, then `newMask = mask | (1<<i)` is reachable with `dp[newMask] = (r + nums[i]) % target` (i.e. `0` if that bucket just filled exactly to `target`, restarting a new bucket, or the running partial sum otherwise). The array is `dp[1<<n]`, and the answer is whether `dp[(1<<n) - 1] == 0` (full mask reachable and closes out evenly).

**Complexity.** Time O(2^n · n), Space O(2^n).
```java
class Solution {
    public boolean canPartitionKSubsets(int[] nums, int k) {
        int n = nums.length;
        int sum = 0;
        for (int x : nums) sum += x;
        if (sum % k != 0) return false;
        int target = sum / k;
        for (int x : nums) if (x > target) return false;

        int full = 1 << n;
        int[] dp = new int[full];
        Arrays.fill(dp, -1);
        dp[0] = 0;

        for (int mask = 0; mask < full; mask++) {
            if (dp[mask] == -1) continue;
            int remainder = dp[mask];
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) != 0) continue;         // i already used
                if (remainder + nums[i] > target) continue;    // would overflow current bucket
                int newMask = mask | (1 << i);
                if (dp[newMask] != -1) continue;                // already computed
                dp[newMask] = (remainder + nums[i]) % target;
            }
        }

        return dp[full - 1] == 0;
    }
}
```
*(needs `import java.util.Arrays;`)*

## Key Takeaways
- `dp[mask]` stores *remainder within the current bucket*, not the raw sum — this is what lets `0` double as both "empty new bucket" and "final answer check", correctly chaining bucket boundaries.
- Sorting descending and pruning symmetric/empty buckets are what make the backtracking approach tractable for `n = 16`; without those prunes it degrades badly.
- The bitmask DP visits each of the `2^n` masks once and fans out to `n` transitions, giving a clean `O(2^n · n)` bound independent of `k`'s structure, unlike naive backtracking which is sensitive to bucket-fill order.
