# Subset Sum

**Difficulty:** Very Hard · **Pattern:** Meet in the middle for large targets; DP/bitset for bounded targets · [LeetCode](https://leetcode.com/problems/subset-sum/)

## Problem
Given an array of positive integers `nums` and a target value `target`, determine whether some subset of `nums` sums exactly to `target`.

## Examples
**Example 1**
```
Input:  nums = [3,34,4,12,5,2], target = 9
Output: true
Explanation: The subset [4,5] sums to 9.
```

**Example 2**
```
Input:  nums = [3,34,4,12,5,2], target = 30
Output: false
```

## Constraints
- `1 <= nums.length <= 40`
- `1 <= nums[i] <= 10^9`
- `0 <= target <= 10^18` (values large enough that classic DP over the target is infeasible)

## Approach 1 — Dynamic Programming (bitset)
**Idea.** When `target` is small (say bounded by `10^6`–`10^7`), the classic subset-sum DP applies: `dp[t]` is true if some subset sums to `t`. Process each number and OR the bitset with itself shifted left by `nums[i]`. This is the standard technique for bounded targets and small value ranges.
**Complexity.** Time `O(n · target / 64)` using a bitset (`O(n · target)` naively). Space `O(target / 64)`.
```java
import java.util.*;

class Solution {
    public boolean canPartition(int[] nums, int target) {
        if (target < 0) return false;
        BitSet dp = new BitSet(target + 1);
        dp.set(0);
        for (int num : nums) {
            if (num > target) continue;
            // dp |= dp << num, restricted to [0, target]
            BitSet shifted = new BitSet(target + 1);
            for (int i = dp.nextSetBit(0); i >= 0 && i + num <= target; i = dp.nextSetBit(i + 1)) {
                shifted.set(i + num);
            }
            dp.or(shifted);
            if (dp.get(target)) return true;
        }
        return dp.get(target);
    }
}
```

## Approach 2 — Meet in the middle (optimal for large targets)
**Idea.** When `target` (or `nums[i]`) can be astronomically large (up to `10^9`–`10^18`), a DP over the target range is impossible. Instead split `nums` into two halves of size `~n/2`. Enumerate all `2^(n/2)` subset sums of each half, sort one half's sums, then for every sum `s` in the other half binary search for the exact complement `target - s`.
**Complexity.** Time `O(2^(n/2) · n)` to enumerate, `O(2^(n/2) log(2^(n/2)))` to sort and probe. Space `O(2^(n/2))`.
```java
import java.util.*;

class Solution {
    public boolean canPartition(long[] nums, long target) {
        int n = nums.length;
        int mid = n / 2;
        long[] left = Arrays.copyOfRange(nums, 0, mid);
        long[] right = Arrays.copyOfRange(nums, mid, n);

        long[] leftSums = allSums(left);
        long[] rightSums = allSums(right);
        Arrays.sort(rightSums);

        for (long s : leftSums) {
            long need = target - s;
            if (binarySearch(rightSums, need)) return true;
        }
        return false;
    }

    private boolean binarySearch(long[] sorted, long value) {
        int lo = 0, hi = sorted.length - 1;
        while (lo <= hi) {
            int mid = (lo + hi) >>> 1;
            if (sorted[mid] == value) return true;
            if (sorted[mid] < value) lo = mid + 1; else hi = mid - 1;
        }
        return false;
    }

    private long[] allSums(long[] arr) {
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
- Choose the technique based on which quantity is small: DP/bitset shines when `target` is bounded and modest; meet in the middle shines when `n` is small (≤ ~40) but values/target are huge.
- Meet in the middle needs an *exact* complement match here (unlike "closest sum" variants), so a plain binary search for equality suffices — no need to inspect neighbors.
- Both approaches generalize: DP variant can also reconstruct a witnessing subset by tracking parent pointers; meet-in-middle variant can too by remembering which mask produced each sum.
