# Split Array With Same Average

**Difficulty:** Very Hard · **Pattern:** Meet in the middle — group subset sums by size, match halves so the average equals the whole array's average · [LeetCode](https://leetcode.com/problems/split-array-with-same-average/)

## Problem
Given an array `nums`, determine if it can be split into two non-empty parts (a subset and its complement) such that both parts have the same average.

## Examples
**Example 1**
```
Input:  nums = [1,2,3,4,5,6,7,8]
Output: true
Explanation: Split into [1,4,5,8] and [2,3,6,7]. Both have average 4.5.
```

**Example 2**
```
Input:  nums = [3,1]
Output: false
```

## Constraints
- `1 <= nums.length <= 30`
- `0 <= nums[i] <= 10^4`

## Approach 1 — Full subset enumeration by size
**Idea.** A subset `A` of size `k` has the same average as the whole array (size `n`, total `total`) iff `sum(A) * n == k * total` (cross-multiplying to avoid fractions). As a baseline, enumerate *every* subset of `nums` directly via bitmask, grouping by size, and check the divisibility condition for each. This only works for small `n` since it is `O(2^n)`.
**Complexity.** Time `O(2^n · n)`. Space `O(2^n)`.
```java
import java.util.*;

class Solution {
    public boolean splitArraySameAverage(int[] nums) {
        int n = nums.length;
        if (n == 1) return false;
        int total = 0;
        for (int x : nums) total += x;

        for (int mask = 1; mask < (1 << n) - 1; mask++) {
            int k = Integer.bitCount(mask);
            int sum = 0;
            for (int i = 0; i < n; i++) if ((mask & (1 << i)) != 0) sum += nums[i];
            if ((long) sum * n == (long) k * total) return true;
        }
        return false;
    }
}
```

## Approach 2 — Meet in the middle (optimal)
**Idea.** Split `nums` into two halves. For each half, precompute the set of achievable sums for every possible subset size (`bySize[k]` = set of sums using exactly `k` elements). For every target size `k` from `1` to `n-1` that satisfies `(k * total) % n == 0`, the required subset sum is `needed = k * total / n`. Try every split `k = k1 + k2` between the two halves: for each sum `s1` achievable with `k1` elements in the left half, check if `needed - s1` is achievable with `k2` elements in the right half via a hash set lookup — no enumeration of the full `2^n` space at once.
**Complexity.** Time `O(2^(n/2) · n)` to build the grouped sum sets, `O(n · 2^(n/2))` amortized for the matching. Space `O(2^(n/2))`.
```java
import java.util.*;

class Solution {
    public boolean splitArraySameAverage(int[] nums) {
        int n = nums.length;
        if (n == 1) return false;

        int total = 0;
        for (int x : nums) total += x;

        int m = n / 2;
        int[] left = Arrays.copyOfRange(nums, 0, m);
        int[] right = Arrays.copyOfRange(nums, m, n);

        List<Set<Integer>> leftBySize = sumsBySize(left);
        List<Set<Integer>> rightBySize = sumsBySize(right);

        for (int k = 1; k < n; k++) {
            if (((long) k * total) % n != 0) continue;
            int needed = (int) (((long) k * total) / n);

            int k1From = Math.max(0, k - right.length);
            int k1To = Math.min(k, left.length);
            for (int k1 = k1From; k1 <= k1To; k1++) {
                int k2 = k - k1;
                if (k2 < 0 || k2 > right.length) continue;
                Set<Integer> leftSet = leftBySize.get(k1);
                Set<Integer> rightSet = rightBySize.get(k2);
                for (int s1 : leftSet) {
                    if (rightSet.contains(needed - s1)) return true;
                }
            }
        }
        return false;
    }

    private List<Set<Integer>> sumsBySize(int[] arr) {
        int n = arr.length;
        List<Set<Integer>> bySize = new ArrayList<>();
        for (int i = 0; i <= n; i++) bySize.add(new HashSet<>());
        bySize.get(0).add(0);
        for (int mask = 1; mask < (1 << n); mask++) {
            int bits = Integer.bitCount(mask);
            int sum = 0;
            for (int i = 0; i < n; i++) if ((mask & (1 << i)) != 0) sum += arr[i];
            bySize.get(bits).add(sum);
        }
        return bySize;
    }
}
```

## Key Takeaways
- The key algebraic trick: `avg(A) == avg(whole)` becomes `sum(A) * n == |A| * total`, turning an average-equality check into an integer divisibility + exact-sum check.
- Grouping by subset size is essential — without it you'd need to check every `(sum, size)` pair against every other, exactly what meet-in-the-middle avoids by bucketing first.
- WLOG only need to search subset sizes `1..n/2` for the *smaller* side and mirror, halving the work further in a tighter implementation.
