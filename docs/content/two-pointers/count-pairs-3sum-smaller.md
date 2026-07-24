# Count Pairs / 3Sum Smaller

**Difficulty:** Hard · **Pattern:** Sort + converging two pointers, counting a full range at once instead of a single match · [LeetCode](https://leetcode.com/problems/3sum-smaller/)

## Problem
**3Sum Smaller**: given an array and a target, count the number of triplets (i, j, k) with i<j<k whose sum is strictly less than target. A related simpler variant, **Count Pairs**, counts index pairs (i, j) with i<j whose sum is less than (or satisfies some comparison with) a target — the same converging-pointer idea one dimension down.

## Examples
**Example 1**
```
Input:  nums = [-2,0,1,3], target = 2
Output: 2
Explanation: Triplets summing to less than 2: [-2,0,1] and [-2,0,3].
```
**Example 2 (Count Pairs, 2-sum variant)**
```
Input:  nums = [1,2,3,4], target = 5
Output: 2
Explanation: Pairs with sum < 5: (1,2) and (1,3). (Using 0-indexed sorted array, pairs (nums[0],nums[1]) and (nums[0],nums[2]).)
```

## Constraints
- 0 <= nums.length <= 3500 (3Sum Smaller)
- -100 <= nums[i] <= 100
- -100 <= target <= 100

## Approach 1 — Brute force
**Idea.** Enumerate all triplets i<j<k, check if the sum is less than target, and count matches directly.
**Complexity.** Time O(n^3), Space O(1).
```java
class Solution {
    public int threeSumSmallerBruteForce(int[] nums, int target) {
        int n = nums.length;
        int count = 0;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                for (int k = j + 1; k < n; k++) {
                    if (nums[i] + nums[j] + nums[k] < target) count++;
                }
            }
        }
        return count;
    }
}
```

## Approach 2 — Sort + two pointers with range counting (optimal)
**Idea.** Sort the array. Fix the first element `i` with a loop, then use two pointers `lo = i+1`, `hi = n-1` on the remaining sorted subarray. If `nums[i] + nums[lo] + nums[hi] < target`, then **every** value between `lo` and `hi` paired with `lo` also satisfies the condition (since the array is sorted, replacing hi with anything smaller only decreases the sum further) — so add `hi - lo` pairs at once and advance `lo`. Otherwise the sum is too big, so decrement `hi`. This counting-a-range-at-once trick is what makes it different from standard 2Sum matching.
**Complexity.** Time O(n^2), Space O(log n) to O(n) for sort.
```java
import java.util.Arrays;

class Solution {
    public int threeSumSmaller(int[] nums, int target) {
        Arrays.sort(nums);
        int n = nums.length;
        int count = 0;
        for (int i = 0; i < n - 2; i++) {
            int lo = i + 1, hi = n - 1;
            while (lo < hi) {
                if (nums[i] + nums[lo] + nums[hi] < target) {
                    count += hi - lo;   // all pairs (lo, lo+1..hi) work
                    lo++;
                } else {
                    hi--;
                }
            }
        }
        return count;
    }

    // Count Pairs variant: count index pairs (i, j), i<j, with nums[i] + nums[j] < target
    public int countPairsLessThan(int[] nums, int target) {
        Arrays.sort(nums);
        int lo = 0, hi = nums.length - 1;
        int count = 0;
        while (lo < hi) {
            if (nums[lo] + nums[hi] < target) {
                count += hi - lo;
                lo++;
            } else {
                hi--;
            }
        }
        return count;
    }
}
```

## Key Takeaways
- The key trick distinguishing this from 3Sum's exact-match pointer walk: when a condition holds, it holds for the whole range between the pointers (due to sorted order), so count in bulk (`hi - lo`) instead of one pair at a time.
- Common trap: after counting `hi - lo` and advancing `lo`, do NOT also decrement `hi` — you've already accounted for all valid pairings with the old `hi`.
- Same reduction pattern as 3Sum (fix one, two-pointer the rest), but the pointer-move decision counts a range rather than searching for equality — a small change with an easy-to-miss off-by-one risk.
- Related problems: 3Sum, 3Sum Closest, 4Sum.
