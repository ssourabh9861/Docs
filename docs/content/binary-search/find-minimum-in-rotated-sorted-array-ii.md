# Find Minimum in Rotated Sorted Array II

**Difficulty:** Hard · **Pattern:** Modified binary search on index with duplicate-handling shrink step · [LeetCode](https://leetcode.com/problems/find-minimum-in-rotated-sorted-array-ii/)

## Problem
A sorted array (possibly containing duplicates) has been rotated at an unknown pivot. Find the minimum element in `O(log n)` average time (worst case degrades to `O(n)` due to duplicates).

## Examples
**Example 1**
```
Input:  nums = [1,3,5]
Output: 1
Explanation: Array is not rotated (or rotated by array length), minimum is at index 0.
```
**Example 2**
```
Input:  nums = [2,2,2,0,1]
Output: 0
Explanation: Rotated; duplicates at both ends make mid == right ambiguous, requiring a linear shrink.
```

## Constraints
- `n == nums.length`
- `1 <= n <= 5000`
- `-5000 <= nums[i] <= 5000`
- `nums` is sorted and rotated between `1` and `n` times.

## Approach 1 — Linear scan
**Idea.** Just scan the array and track the minimum value seen.
**Complexity.** Time O(n), Space O(1). Correct but ignores the structure of the problem.
```java
class Solution {
    public int findMin(int[] nums) {
        int min = nums[0];
        for (int x : nums) min = Math.min(min, x);
        return min;
    }
}
```

## Approach 2 — Modified binary search with duplicate handling (optimal average case)
**Idea.** Maintain `lo, hi` bracketing the minimum. Compare `nums[mid]` with `nums[hi]`:
- If `nums[mid] > nums[hi]`: the minimum must be in the right half (rotation point is after mid), so `lo = mid + 1`.
- If `nums[mid] < nums[hi]`: the minimum is at `mid` or to its left, so `hi = mid` (keep mid, since it could be the answer).
- If `nums[mid] == nums[hi]`: we can't tell which side the minimum is on (duplicates hide the rotation point) — safely shrink by `hi--`, which never skips the true minimum since `nums[hi]` has an equal duplicate remaining at `mid` or elsewhere.
This is the key predicate/decision rule; the tie case is what turns worst-case complexity from O(log n) to O(n) (e.g., all-equal array), but average case stays logarithmic.
**Complexity.** Time O(log n) average, O(n) worst case (all duplicates), Space O(1).
```java
class Solution {
    public int findMin(int[] nums) {
        int lo = 0, hi = nums.length - 1;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (nums[mid] > nums[hi]) {
                lo = mid + 1;       // min is strictly to the right
            } else if (nums[mid] < nums[hi]) {
                hi = mid;           // min is at mid or to the left
            } else {
                hi--;               // nums[mid] == nums[hi]: ambiguous, shrink safely
            }
        }
        return nums[lo];
    }
}
```

## Key Takeaways
- Compare `nums[mid]` against `nums[hi]` (not `nums[lo]`) — this correctly identifies which half is "rotated" and contains the minimum.
- The `nums[mid] == nums[hi]` tie is the classic trap with duplicates: you must shrink `hi` by exactly one rather than guessing a direction, or you risk skipping over the minimum.
- This tie-breaking is exactly why worst-case complexity degrades to O(n) for arrays like `[2,2,2,2,2]` — an interviewer follow-up almost always asks you to justify this.
- Related: Find Minimum in Rotated Sorted Array I (no duplicates, strictly O(log n)), Search in Rotated Sorted Array (search a target value with the same rotation logic).
