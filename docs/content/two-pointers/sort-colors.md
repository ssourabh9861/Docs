# Sort Colors

**Difficulty:** Medium · **Pattern:** Three-way partitioning with fast/slow-style converging pointers (Dutch National Flag) · [LeetCode](https://leetcode.com/problems/sort-colors/)

## Problem
Given an array containing only 0s, 1s, and 2s (representing red, white, blue), sort it in place in a single pass without using a library sort.

## Examples
**Example 1**
```
Input:  nums = [2,0,2,1,1,0]
Output: [0,0,1,1,2,2]
```
**Example 2**
```
Input:  nums = [2,0,1]
Output: [0,1,2]
```

## Constraints
- n == nums.length
- 1 <= n <= 300
- nums[i] is 0, 1, or 2
- Follow-up: solve in one pass with O(1) extra space (Dutch National Flag)

## Approach 1 — Counting sort (two passes)
**Idea.** Count occurrences of 0, 1, 2 in one pass, then overwrite the array in a second pass based on the counts.
**Complexity.** Time O(n), Space O(1) (fixed-size count array).
```java
class Solution {
    public void sortColorsCounting(int[] nums) {
        int[] count = new int[3];
        for (int num : nums) count[num]++;
        int idx = 0;
        for (int color = 0; color < 3; color++) {
            for (int c = 0; c < count[color]; c++) {
                nums[idx++] = color;
            }
        }
    }
}
```

## Approach 2 — Dutch National Flag, one pass (optimal)
**Idea.** Maintain three pointers: `low` (boundary for next 0), `mid` (current element under inspection), `high` (boundary for next 2). Scan with `mid`: if nums[mid] == 0, swap with `low` and advance both `low` and `mid`; if nums[mid] == 2, swap with `high` and decrement `high` only (re-examine the swapped-in value); if nums[mid] == 1, just advance `mid`. This partitions the array into [0s | 1s | 2s] in a single left-to-right sweep.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public void sortColors(int[] nums) {
        int low = 0, mid = 0, high = nums.length - 1;
        while (mid <= high) {
            if (nums[mid] == 0) {
                swap(nums, low, mid);
                low++;
                mid++;
            } else if (nums[mid] == 2) {
                swap(nums, mid, high);
                high--;
                // don't advance mid: swapped-in value must still be checked
            } else {
                mid++;
            }
        }
    }

    private void swap(int[] nums, int i, int j) {
        int tmp = nums[i];
        nums[i] = nums[j];
        nums[j] = tmp;
    }
}
```

## Key Takeaways
- The classic trap: after swapping nums[mid] with nums[high] in the "2" case, you must NOT increment mid, since the newly swapped-in value at mid hasn't been classified yet.
- This is the Dutch National Flag algorithm — a three-way partition generalizing the two-way partition used in quicksort's Lomuto/Hoare schemes.
- Works for exactly 3 distinct values; generalizes conceptually to quicksort's 3-way partitioning for arrays with many duplicate keys.
- Related problems: Partition array around a pivot (quicksort), Move Zeroes.
