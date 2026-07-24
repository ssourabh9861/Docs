# Partition to K Equal Sum Subsets

**Difficulty:** Hard · **Pattern:** subset-sum bucket-filling backtracking with pruning · [LeetCode](https://leetcode.com/problems/partition-to-k-equal-sum-subsets/)

## Problem
Given an integer array `nums` and an integer `k`, return `true` if `nums` can be partitioned into `k` non-empty subsets whose sums are all equal.

## Examples
**Example 1**
```
Input:  nums = [4,3,2,3,5,2,4,5], k = 4
Output: true
Explanation: total = 28, target per bucket = 7; e.g. buckets (5,2),(4,3),(3,4),(5,2).
```
**Example 2**
```
Input:  nums = [1,2,3,4], k = 3
Output: false
Explanation: total = 10 is not divisible by 3, so no equal-sum partition into 3 buckets exists.
```

## Constraints
- `1 <= k <= nums.length <= 16`
- `1 <= nums[i] <= 10^4`
- The frequency of each element is in the range `[1, 4]`

## Approach 1 — Per-element bucket assignment (choose a bucket for each number)
**Idea.** Compute `target = sum / k` (return `false` immediately if not divisible, or if any single element exceeds `target`). Sort descending so large elements are placed first (they fail fast if they can't fit anywhere, pruning deep branches early). Maintain a `bucketSums[k]` array; recursively assign each number (by index) to some bucket whose current sum plus the number doesn't exceed `target` — choose a bucket, recurse to the next number, un-choose (subtract back out) if that branch fails. Skip assigning to a bucket with the same running sum as one already tried at this level (dedup — trying an equal-sum empty bucket twice is redundant).
**Complexity.** Time O(k^n) worst case (n = nums.length, k choices per element), heavily pruned by the target-sum and dedup checks, Space O(n + k) recursion + bucket array.
```java
import java.util.*;

class Solution {
    public boolean canPartitionKSubsets(int[] nums, int k) {
        int sum = 0;
        for (int num : nums) sum += num;
        if (sum % k != 0) return false;
        int target = sum / k;

        Arrays.sort(nums);
        // reverse to descending: place largest numbers first for faster failure
        for (int i = 0, j = nums.length - 1; i < j; i++, j--) {
            int tmp = nums[i]; nums[i] = nums[j]; nums[j] = tmp;
        }
        if (nums[0] > target) return false;

        int[] bucketSums = new int[k];
        return backtrack(nums, 0, bucketSums, target);
    }

    private boolean backtrack(int[] nums, int idx, int[] bucketSums, int target) {
        if (idx == nums.length) return true; // all numbers placed successfully

        int num = nums[idx];
        Set<Integer> triedSums = new HashSet<>(); // dedup: skip buckets with a sum we already tried at this depth
        for (int b = 0; b < bucketSums.length; b++) {
            if (bucketSums[b] + num > target) continue;      // prune: would overflow bucket
            if (!triedSums.add(bucketSums[b])) continue;      // prune: equivalent bucket state already tried

            bucketSums[b] += num;                 // choose
            if (backtrack(nums, idx + 1, bucketSums, target)) return true; // explore
            bucketSums[b] -= num;                 // un-choose
        }
        return false;
    }
}
```

## Approach 2 — Bitmask "remaining picks" with visited-state memoization (optimal / pruned)
**Idea.** Represent the set of already-used elements as a bitmask over `n` positions. Track just one "current bucket's running sum" (`curSum`) and greedily fill one bucket completely before starting the next: iterate candidate elements not yet in the mask; if `curSum + nums[i] <= target`, recurse with the updated mask and `curSum + nums[i]` (resetting `curSum` to 0 and decrementing `remainingBuckets` when a bucket exactly hits `target`). Skip duplicate values already tried at the same fill position (same skip-equal idea as Combination Sum II) and memoize failed masks in a `Map<Integer, Boolean>`/`Boolean[]` so the same "used-set with same running configuration" is never re-explored. This reduces the effective search space from `k^n` down to `O(2^n · n)` by collapsing bucket identity into just the mask + memo.
**Complexity.** Time O(2^n · n) thanks to memoization on the mask, Space O(2^n) for memo + O(n) recursion.
```java
import java.util.*;

class Solution {
    private int[] nums;
    private int n, target;
    private Boolean[] memo; // memo[mask] = can the *remaining* elements (given mask used) be
                             // completed starting a fresh bucket? null = unknown

    public boolean canPartitionKSubsets(int[] nums, int k) {
        int sum = 0;
        for (int num : nums) sum += num;
        if (sum % k != 0) return false;
        this.target = sum / k;
        this.nums = nums;
        this.n = nums.length;
        for (int num : nums) if (num > target) return false;

        Arrays.sort(this.nums); // ascending; helps skip-equal dedup below
        memo = new Boolean[1 << n];
        return backtrack((1 << n) - 1, 0, k); // start with the full "available" mask
    }

    // available: bitmask of indices NOT yet used. curSum: current bucket's running sum.
    // remainingBuckets: how many buckets still need to be completely filled.
    private boolean backtrack(int available, int curSum, int remainingBuckets) {
        if (remainingBuckets == 0) return true; // all buckets filled
        if (curSum == target) {
            // this bucket is done; start a fresh one with the same available set
            return backtrack(available, 0, remainingBuckets - 1);
        }
        if (curSum == 0 && memo[available] != null) return memo[available];

        boolean found = false;
        int lastTried = -1;
        for (int i = 0; i < n; i++) {
            if ((available & (1 << i)) == 0) continue;       // already used
            if (nums[i] == lastTried) continue;               // skip-equal sibling at this depth
            if (curSum + nums[i] > target) continue;          // prune: would overflow bucket

            lastTried = nums[i];
            int nextAvailable = available & ~(1 << i);        // choose i
            if (backtrack(nextAvailable, curSum + nums[i], remainingBuckets)) {
                found = true;
                break;
            }
            // un-choose is implicit: nextAvailable is a fresh local value, `available` unaffected
        }

        if (curSum == 0) memo[available] = found; // cache only "start of a fresh bucket" states
        return found;
    }
}
```

## Key Takeaways
- The core reframing is "bin-packing into k equal buckets," which is itself a form of subset-sum: either assign each element to a bucket directly (Approach 1) or fill one bucket to exactly `target` before starting the next (Approach 2) — both are valid backtracking framings.
- Sorting descending and failing fast when the largest remaining element can't fit anywhere is a critical prune; without it, small elements get tried first and the search wastes enormous time before hitting a wall.
- The "skip buckets with an identical running sum already tried at this recursion depth" prune (via a per-call `HashSet`, or via `lastTried` when iterating a sorted array) eliminates symmetric/duplicate branches — the same idea as skip-equal dedup in Combination Sum II.
- Memoizing on the bitmask of used elements (only at bucket-boundary states, i.e., `curSum == 0`) is what pushes Approach 2 from exponential-in-buckets to exponential-in-subsets-of-n, a meaningful complexity improvement when `k` is large relative to `n`.
