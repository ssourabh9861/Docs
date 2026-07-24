# Closest Subsequence Sum

**Difficulty:** Hard · **Pattern:** Meet in the middle — enumerate subset sums of both halves, sort one, binary search the other · [LeetCode](https://leetcode.com/problems/closest-subsequence-sum/)

## Problem
Given an integer array `nums` and an integer `goal`, choose a subsequence (any subset, including empty) of `nums` whose sum is as close as possible to `goal`. Return the minimum possible `|sum - goal|`.

## Examples
**Example 1**
```
Input:  nums = [5,-7,3,5], goal = 6
Output: 0
Explanation: Choose the whole array as the subsequence: 5 + (-7) + 3 + 5 = 6, exactly matching goal.
```

## Constraints
- `1 <= nums.length <= 40`
- `-10^7 <= nums[i] <= 10^7`
- `-10^9 <= goal <= 10^9`

## Approach 1 — Meet in the middle (direct pairing)
**Idea.** With `n` up to 40, a full `2^40` subset enumeration is infeasible, but splitting into two halves of `~20` elements gives `2^20` subsets each, which is tractable. Enumerate all subset sums of the left half and all subset sums of the right half. Any achievable total is `leftSum + rightSum` for some pair. As a baseline, pair every left sum with every right sum and track the closest to `goal`.
**Complexity.** Time `O(2^(n/2))` to enumerate each half, `O(2^(n/2) · 2^(n/2))` to pair (too slow for n=40, motivating Approach 2). Space `O(2^(n/2))`.
```java
import java.util.*;

class Solution {
    public int minAbsDifference(int[] nums, int goal) {
        int n = nums.length;
        int mid = n / 2;
        int[] left = Arrays.copyOfRange(nums, 0, mid);
        int[] right = Arrays.copyOfRange(nums, mid, n);

        long[] leftSums = allSums(left);
        long[] rightSums = allSums(right);

        long best = Long.MAX_VALUE;
        for (long a : leftSums) {
            for (long b : rightSums) {
                best = Math.min(best, Math.abs(a + b - goal));
            }
        }
        return (int) best;
    }

    private long[] allSums(int[] arr) {
        int n = arr.length;
        long[] sums = new long[1 << n];
        for (int mask = 0; mask < (1 << n); mask++) {
            long s = 0;
            for (int i = 0; i < n; i++) if ((mask & (1 << i)) != 0) s += arr[i];
            sums[mask] = s;
        }
        return sums;
    }
}
```

## Approach 2 — Meet in the middle + binary search (optimal)
**Idea.** Sort the right half's sums. For each sum `a` in the left half, the best partner is the value in the sorted right array closest to `goal - a`; find it via `binarySearch`'s insertion point and check the immediate neighbors. This avoids the quadratic pairing.
**Complexity.** Time `O(2^(n/2) · (n/2) log(2^(n/2)))` — dominated by enumeration and sort, with `O(log)` lookups per left sum. Space `O(2^(n/2))`.
```java
import java.util.*;

class Solution {
    public int minAbsDifference(int[] nums, int goal) {
        int n = nums.length;
        int mid = n / 2;
        int[] left = Arrays.copyOfRange(nums, 0, mid);
        int[] right = Arrays.copyOfRange(nums, mid, n);

        long[] leftSums = allSums(left);
        long[] rightSums = allSums(right);
        Arrays.sort(rightSums);

        long best = Long.MAX_VALUE;
        for (long a : leftSums) {
            long target = goal - a;
            int idx = lowerBound(rightSums, target);
            if (idx < rightSums.length) {
                best = Math.min(best, Math.abs(a + rightSums[idx] - goal));
            }
            if (idx > 0) {
                best = Math.min(best, Math.abs(a + rightSums[idx - 1] - goal));
            }
            if (best == 0) return 0;
        }
        return (int) best;
    }

    private int lowerBound(long[] sorted, long target) {
        int lo = 0, hi = sorted.length;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (sorted[mid] < target) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    private long[] allSums(int[] arr) {
        int n = arr.length;
        long[] sums = new long[1 << n];
        for (int mask = 0; mask < (1 << n); mask++) {
            long s = 0;
            for (int i = 0; i < n; i++) if ((mask & (1 << i)) != 0) s += arr[i];
            sums[mask] = s;
        }
        return sums;
    }
}
```

## Key Takeaways
- The empty subsequence (sum 0) is automatically included since `mask = 0` is enumerated in each half.
- Splitting `n=40` into two `n=20` halves converts a hopeless `2^40` search into two `2^20` searches — the classic meet-in-the-middle size threshold.
- Early-exit as soon as `best == 0` since it can't improve further, a small but useful practical optimization.
