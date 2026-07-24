# Partition Array Into Two Arrays to Minimize Sum Difference

**Difficulty:** Hard · **Pattern:** Meet in the middle — split into halves, group subset sums by chosen count, binary search the complement · [LeetCode](https://leetcode.com/problems/partition-array-into-two-arrays-to-minimize-sum-difference/)

## Problem
Given an array `nums` of `2n` integers (can be negative), split it into two arrays `arr1` and `arr2`, each of size `n`. Minimize `|sum(arr1) - sum(arr2)|`.

## Examples
**Example 1**
```
Input:  nums = [3,9,7,3]
Output: 2
Explanation: arr1 = [3,9], arr2 = [7,3]. |12 - 10| = 2.
```

## Constraints
- `1 <= n <= 15`
- `nums.length == 2 * n`
- `-1e7 <= nums[i] <= 1e7`

## Approach 1 — Meet in the middle (direct pairing)
**Idea.** Split `nums` into `left` and `right`, each of size `n`. Enumerate all `2^n` subsets of each half via bitmask, and group each half's subset sums by the count of elements chosen (0..n), since `arr1` must ultimately have exactly `n` elements total. For a fixed split `k + (n-k) = n`, pair every sum in `leftByCount[k]` with every sum in `rightByCount[n-k]` directly (no sorting), tracking the best `|2*sum1 - total|`.
**Complexity.** Time `O(2^n · n)` to build the groups, `O(C(2n,n))` for the pairing in the worst case (still exponential but far smaller than `2^(2n)`). Space `O(2^n)`.
```java
import java.util.*;

class Solution {
    public int minimumDifference(int[] nums) {
        int n = nums.length / 2;
        int[] left = Arrays.copyOfRange(nums, 0, n);
        int[] right = Arrays.copyOfRange(nums, n, nums.length);

        long total = 0;
        for (int x : nums) total += x;

        List<List<Long>> leftByCount = sumsByCount(left);
        List<List<Long>> rightByCount = sumsByCount(right);

        long best = Long.MAX_VALUE;
        for (int k = 0; k <= n; k++) {
            for (long s : leftByCount.get(k)) {
                for (long t : rightByCount.get(n - k)) {
                    long diff = Math.abs(2 * (s + t) - total);
                    best = Math.min(best, diff);
                }
            }
        }
        return (int) best;
    }

    private List<List<Long>> sumsByCount(int[] arr) {
        int n = arr.length;
        List<List<Long>> byCount = new ArrayList<>();
        for (int i = 0; i <= n; i++) byCount.add(new ArrayList<>());
        for (int mask = 0; mask < (1 << n); mask++) {
            long sum = 0;
            int cnt = 0;
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) != 0) { sum += arr[i]; cnt++; }
            }
            byCount.get(cnt).add(sum);
        }
        return byCount;
    }
}
```

## Approach 2 — Meet in the middle + binary search (optimal)
**Idea.** Same grouping as above, but sort each `rightByCount[k]` list. For every `s` in `leftByCount[k]`, instead of scanning all of `rightByCount[n-k]`, binary search for the value closest to `(total - 2s) / 2` — the `t` that makes `s + t` closest to `total / 2`. Only the neighbors at the found insertion point can be optimal, so check just those two candidates.
**Complexity.** Time `O(2^n · n log(2^n))`. Space `O(2^n)`.
```java
import java.util.*;

class Solution {
    public int minimumDifference(int[] nums) {
        int n = nums.length / 2;
        int[] left = Arrays.copyOfRange(nums, 0, n);
        int[] right = Arrays.copyOfRange(nums, n, nums.length);

        long total = 0;
        for (int x : nums) total += x;

        List<List<Long>> leftByCount = sumsByCount(left);
        List<List<Long>> rightByCount = sumsByCount(right);
        for (List<Long> list : rightByCount) Collections.sort(list);

        long best = Long.MAX_VALUE;
        for (int k = 0; k <= n; k++) {
            List<Long> leftSums = leftByCount.get(k);
            List<Long> rightSums = rightByCount.get(n - k);
            for (long s : leftSums) {
                double target = (total - 2.0 * s) / 2.0;
                int idx = lowerBound(rightSums, target);
                for (int cand = idx - 1; cand <= idx; cand++) {
                    if (cand < 0 || cand >= rightSums.size()) continue;
                    long t = rightSums.get(cand);
                    long diff = Math.abs(2 * (s + t) - total);
                    best = Math.min(best, diff);
                }
            }
        }
        return (int) best;
    }

    private int lowerBound(List<Long> sorted, double target) {
        int lo = 0, hi = sorted.size();
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (sorted.get(mid) < target) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    private List<List<Long>> sumsByCount(int[] arr) {
        int n = arr.length;
        List<List<Long>> byCount = new ArrayList<>();
        for (int i = 0; i <= n; i++) byCount.add(new ArrayList<>());
        for (int mask = 0; mask < (1 << n); mask++) {
            long sum = 0;
            int cnt = 0;
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) != 0) { sum += arr[i]; cnt++; }
            }
            byCount.get(cnt).add(sum);
        }
        return byCount;
    }
}
```

## Key Takeaways
- `n` up to 15 means `2n` up to 30 — too large for a direct `2^30` subset enumeration but perfect for meet in the middle (`2 · 2^15`).
- Grouping by "count chosen" is essential here because the final split must have exactly `n` elements per side — this is the key twist over plain subset-sum meet-in-middle.
- Sorting one half and binary searching turns an exponential pairing step into a near-linear one; only the insertion-point neighbors ever matter for a "closest value" query.
