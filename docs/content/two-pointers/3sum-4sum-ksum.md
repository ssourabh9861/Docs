# 3Sum / 4Sum / kSum

**Difficulty:** Medium · **Pattern:** Sort + fixed prefix elements + converging two pointers on the remainder · [LeetCode](https://leetcode.com/problems/3sum/)

## Problem
Given an array of integers, find all **unique** combinations of k numbers that sum to a target (usually 0). 3Sum and 4Sum are special cases of the general kSum recursion: fix outer elements one at a time, then solve the last two with opposite-end pointers on a sorted array.

## Examples
**Example 1**
```
Input:  nums = [-1,0,1,2,-1,-4]
Output: [[-1,-1,2],[-1,0,1]]
Explanation: These are the only triplets that sum to 0, with duplicates removed.
```
**Example 2**
```
Input:  nums = [1,0,-1,0,-2,2], target = 0   (4Sum)
Output: [[-2,-1,1,2],[-2,0,0,2],[-1,0,0,1]]
Explanation: All unique quadruplets summing to 0.
```

## Constraints
- 3 <= nums.length <= 1000 (3Sum), 1 <= nums.length <= 200 (4Sum)
- -10^9 <= nums[i] <= 10^9 (bounds vary by variant; 4Sum uses int range with long intermediate sums)
- Result must not contain duplicate triplets/quadruplets, order of triplets doesn't matter

## Approach 1 — Brute force
**Idea.** For 3Sum, try every triplet of indices (i, j, k) with i<j<k, check if they sum to target, dedupe with a set. Generalizes to k nested loops for kSum.
**Complexity.** Time O(n^k), Space O(n^k) for storing results (dedup set).
```java
import java.util.*;

class Solution {
    public List<List<Integer>> threeSumBruteForce(int[] nums) {
        Set<List<Integer>> seen = new HashSet<>();
        int n = nums.length;
        int[] sorted = nums.clone();
        Arrays.sort(sorted);
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                for (int k = j + 1; k < n; k++) {
                    if (sorted[i] + sorted[j] + sorted[k] == 0) {
                        seen.add(Arrays.asList(sorted[i], sorted[j], sorted[k]));
                    }
                }
            }
        }
        return new ArrayList<>(seen);
    }
}
```

## Approach 2 — Sort + two pointers (optimal for 3Sum/4Sum)
**Idea.** Sort the array. Fix the outer element(s) with a loop (skipping duplicates), then use two pointers converging from both ends of the remaining sorted subarray to find pairs summing to the residual target — classic reduction of kSum to 2Sum. For 4Sum, add one more fixed loop before the two-pointer pass. The general kSum recursion fixes elements until only 2 remain, then applies the two-pointer 2Sum-sorted routine, recursing with early-exit pruning (skip when min possible sum > target or max possible sum < target).
**Complexity.** Time O(n^2) for 3Sum, O(n^3) for 4Sum, O(n^(k-1)) for general kSum. Space O(log n) to O(n) for sort, O(1) extra excluding output.
```java
import java.util.*;

class Solution {
    // 3Sum
    public List<List<Integer>> threeSum(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> res = new ArrayList<>();
        int n = nums.length;
        for (int i = 0; i < n - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;   // skip dup anchor
            if (nums[i] > 0) break;                          // sorted, no zero-sum possible
            int lo = i + 1, hi = n - 1;
            while (lo < hi) {
                int sum = nums[i] + nums[lo] + nums[hi];
                if (sum == 0) {
                    res.add(Arrays.asList(nums[i], nums[lo], nums[hi]));
                    lo++; hi--;
                    while (lo < hi && nums[lo] == nums[lo - 1]) lo++;
                    while (lo < hi && nums[hi] == nums[hi + 1]) hi--;
                } else if (sum < 0) {
                    lo++;
                } else {
                    hi--;
                }
            }
        }
        return res;
    }

    // General kSum (also covers 4Sum with k=4)
    public List<List<Integer>> fourSum(int[] nums, int target) {
        Arrays.sort(nums);
        return kSum(nums, target, 0, 4);
    }

    private List<List<Integer>> kSum(int[] nums, long target, int start, int k) {
        List<List<Integer>> res = new ArrayList<>();
        int n = nums.length;
        if (start == n || nums[start] * (long) k > target || target > nums[n - 1] * (long) k) {
            return res;
        }
        if (k == 2) {
            int lo = start, hi = n - 1;
            while (lo < hi) {
                long sum = (long) nums[lo] + nums[hi];
                if (sum == target) {
                    res.add(Arrays.asList(nums[lo], nums[hi]));
                    lo++; hi--;
                    while (lo < hi && nums[lo] == nums[lo - 1]) lo++;
                    while (lo < hi && nums[hi] == nums[hi + 1]) hi--;
                } else if (sum < target) {
                    lo++;
                } else {
                    hi--;
                }
            }
            return res;
        }
        for (int i = start; i < n - k + 1; i++) {
            if (i > start && nums[i] == nums[i - 1]) continue; // skip dup at this level
            for (List<Integer> sub : kSum(nums, target - nums[i], i + 1, k - 1)) {
                List<Integer> combo = new ArrayList<>();
                combo.add(nums[i]);
                combo.addAll(sub);
                res.add(combo);
            }
        }
        return res;
    }
}
```

## Key Takeaways
- Sorting first is what enables the two-pointer collapse of the innermost 2Sum layer — always sort before applying this pattern.
- Dedup happens at two levels: skip duplicate anchors in the fixed loops, and skip duplicate lo/hi values after a match.
- The kSum recursion with pruning bounds (min/max possible sum vs target) generalizes 3Sum/4Sum/kSum into one reusable template — memorize this shape.
- Related problems: Two Sum II (sorted), 3Sum Closest, 3Sum Smaller.
