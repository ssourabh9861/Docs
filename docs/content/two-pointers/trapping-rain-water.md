# Trapping Rain Water

**Difficulty:** Hard · **Pattern:** Opposite-end two pointers tracking running max boundaries · [LeetCode](https://leetcode.com/problems/trapping-rain-water/)

## Problem
Given an elevation map as an array of non-negative heights, compute how much water it can trap after raining. Water trapped above any bar is bounded by the shorter of the tallest bar to its left and the tallest bar to its right, minus its own height.

## Examples
**Example 1**
```
Input:  height = [0,1,0,2,1,0,1,3,2,1,2,1]
Output: 6
Explanation: The map traps 6 units of water between the bars, mostly around indices 5-6 and 9.
```
**Example 2**
```
Input:  height = [4,2,0,3,2,5]
Output: 9
```

## Constraints
- n == height.length
- 1 <= n <= 2 * 10^4
- 0 <= height[i] <= 10^5

## Approach 1 — Prefix/suffix max arrays
**Idea.** Precompute leftMax[i] (tallest bar in height[0..i]) and rightMax[i] (tallest bar in height[i..n-1]). Water at i is min(leftMax[i], rightMax[i]) - height[i], summed over all i.
**Complexity.** Time O(n), Space O(n) for the two auxiliary arrays.
```java
class Solution {
    public int trapPrefixSuffix(int[] height) {
        int n = height.length;
        if (n == 0) return 0;
        int[] leftMax = new int[n];
        int[] rightMax = new int[n];
        leftMax[0] = height[0];
        for (int i = 1; i < n; i++) leftMax[i] = Math.max(leftMax[i - 1], height[i]);
        rightMax[n - 1] = height[n - 1];
        for (int i = n - 2; i >= 0; i--) rightMax[i] = Math.max(rightMax[i + 1], height[i]);
        int water = 0;
        for (int i = 0; i < n; i++) water += Math.min(leftMax[i], rightMax[i]) - height[i];
        return water;
    }
}
```

## Approach 2 — Two pointers, O(1) space (optimal)
**Idea.** Maintain `left`, `right` pointers at the array ends and running `leftMax`, `rightMax`. At each step, advance the side with the smaller current height, because that side's water level is already fully determined by its own running max (the taller side guarantees it isn't the limiting boundary). Add `runningMax - height[pointer]` to the total before moving the pointer inward.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int trap(int[] height) {
        int left = 0, right = height.length - 1;
        int leftMax = 0, rightMax = 0;
        int water = 0;
        while (left < right) {
            if (height[left] < height[right]) {
                leftMax = Math.max(leftMax, height[left]);
                water += leftMax - height[left];
                left++;
            } else {
                rightMax = Math.max(rightMax, height[right]);
                water += rightMax - height[right];
                right--;
            }
        }
        return water;
    }
}
```

## Key Takeaways
- The correctness argument for the two-pointer move is subtle: whichever side is currently shorter has its trapped water fully determined, because the opposite side already has a taller-or-equal max acting as a guaranteed boundary.
- No need to store prefix/suffix arrays once you track only the two running maxes — this collapses O(n) space to O(1).
- Contrast with **Trapping Rain Water II**, which needs a min-heap boundary-BFS instead because 2D water levels aren't reducible to two 1D pointers.
- Related problems: Container With Most Water (similar two-pointer shrinking, different objective — max area vs total trapped volume).
