# Trapping Rain Water

**Difficulty:** Hard · **Pattern:** monotonic decreasing stack of "walls" pairing with next taller bar · [LeetCode](https://leetcode.com/problems/trapping-rain-water/)

## Problem
Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much rainwater can be trapped after it rains.

## Examples
**Example 1**
```
Input:  height = [0,1,0,2,1,0,1,3,2,1,2,1]
Output: 6
Explanation: The elevation map traps 6 units of water (visualized as the classic LeetCode diagram).
```

**Example 2**
```
Input:  height = [4,2,0,3,2,5]
Output: 9
```

## Constraints
- `n == height.length`
- `1 <= n <= 2 * 10^4`
- `0 <= height[i] <= 10^5`

## Approach 1 — Brute Force
**Idea.** Water trapped above index `i` equals `min(maxLeft(i), maxRight(i)) - height[i]`, floored at 0. Naively recompute `maxLeft`/`maxRight` by scanning outward from each index.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int trap(int[] height) {
        int n = height.length, total = 0;
        for (int i = 0; i < n; i++) {
            int maxLeft = 0, maxRight = 0;
            for (int l = 0; l <= i; l++) maxLeft = Math.max(maxLeft, height[l]);
            for (int r = i; r < n; r++) maxRight = Math.max(maxRight, height[r]);
            total += Math.min(maxLeft, maxRight) - height[i];
        }
        return total;
    }
}
```

## Approach 2 — Monotonic Stack (featured)
**Idea.** Keep a stack of indices with **decreasing** heights. When the current bar is taller than the bar at the top, that top bar is a local "valley bottom": pop it, and the new top (if any) together with the current bar forms two walls. The trapped width is the gap between those walls and the trapped height is `min(leftWall, rightWall) - valley height`. Repeat popping while the current bar keeps being taller than the new top, since one bar can complete multiple stacked valleys at once.
**Complexity.** Time O(n) — each index pushed and popped once, Space O(n).
```java
class Solution {
    public int trap(int[] height) {
        Deque<Integer> stack = new ArrayDeque<>(); // indices, heights decreasing
        int total = 0;
        for (int i = 0; i < height.length; i++) {
            while (!stack.isEmpty() && height[i] > height[stack.peek()]) {
                int bottom = stack.pop();
                if (stack.isEmpty()) break; // no left wall
                int left = stack.peek();
                int width = i - left - 1;
                int boundedHeight = Math.min(height[i], height[left]) - height[bottom];
                total += width * boundedHeight;
            }
            stack.push(i);
        }
        return total;
    }
}
```

## Approach 3 — Two Pointers (optimal, O(1) space)
**Idea.** Track `left`, `right` pointers and running `leftMax`, `rightMax`. Always advance the side with the smaller max, since that side's trapped water is fully determined by its own max (the other side is guaranteed to have an equal-or-taller wall).
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int trap(int[] height) {
        int left = 0, right = height.length - 1;
        int leftMax = 0, rightMax = 0, total = 0;
        while (left < right) {
            if (height[left] <= height[right]) {
                leftMax = Math.max(leftMax, height[left]);
                total += leftMax - height[left];
                left++;
            } else {
                rightMax = Math.max(rightMax, height[right]);
                total += rightMax - height[right];
                right--;
            }
        }
        return total;
    }
}
```

## Key Takeaways
- The stack approach processes water **valley by valley**: each pop resolves one horizontal "layer" of trapped water bounded by two taller walls.
- Use a `while`, not `if`, when popping — a single new bar can close out several stacked valleys of different depths.
- Two pointers achieves the same O(n) time with O(1) space by exploiting that the smaller of `leftMax`/`rightMax` alone determines the water level at that pointer.
- Related: Largest Rectangle in Histogram (same stack skeleton, different quantity accumulated), Container With Most Water (two-pointer sibling).
