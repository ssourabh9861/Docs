# Container With Most Water

**Difficulty:** Medium · **Pattern:** Opposite-end two pointers, greedily discard the shorter wall · [LeetCode](https://leetcode.com/problems/container-with-most-water/)

## Problem
Given an array of heights representing vertical lines at each index, find two lines that together with the x-axis form a container holding the most water. The area is `min(height[i], height[j]) * (j - i)`.

## Examples
**Example 1**
```
Input:  height = [1,8,6,2,5,4,8,3,7]
Output: 49
Explanation: Lines at index 1 (height 8) and index 8 (height 7) give area = min(8,7) * (8-1) = 49.
```
**Example 2**
```
Input:  height = [1,1]
Output: 1
```

## Constraints
- n == height.length
- 2 <= n <= 10^5
- 0 <= height[i] <= 10^4

## Approach 1 — Brute force
**Idea.** Check every pair (i, j) and compute the area, keeping the max.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int maxAreaBruteForce(int[] height) {
        int n = height.length;
        int best = 0;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                int area = Math.min(height[i], height[j]) * (j - i);
                best = Math.max(best, area);
            }
        }
        return best;
    }
}
```

## Approach 2 — Two pointers (optimal)
**Idea.** Start with pointers at both ends (widest container). At each step compute the area, record the max, then move the pointer at the **shorter** line inward — moving the taller line can only shrink width without any chance of increasing the limiting height, so it can never produce a better area. Moving the shorter line is the only move that could possibly help.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int maxArea(int[] height) {
        int left = 0, right = height.length - 1;
        int best = 0;
        while (left < right) {
            int h = Math.min(height[left], height[right]);
            int area = h * (right - left);
            best = Math.max(best, area);
            if (height[left] < height[right]) {
                left++;
            } else {
                right--;
            }
        }
        return best;
    }
}
```

## Key Takeaways
- The greedy proof hinges on width only shrinking as pointers converge, so keeping the taller wall never helps — only advancing the shorter wall can find a taller replacement that compensates for lost width.
- Starting from the widest possible container and narrowing is the key insight that makes O(n) possible.
- Don't confuse this with Trapping Rain Water: here you want the max of a single pairwise area, not the sum of trapped volume across the whole array.
- Related problems: Trapping Rain Water, Two Sum II (sorted).
