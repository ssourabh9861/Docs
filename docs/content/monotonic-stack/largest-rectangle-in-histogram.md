# Largest Rectangle in Histogram

**Difficulty:** Hard · **Pattern:** monotonic increasing stack for previous/next smaller element · [LeetCode](https://leetcode.com/problems/largest-rectangle-in-histogram/)

## Problem
Given an array of bar heights of a histogram (bars of width 1, sitting on the x-axis), find the area of the largest axis-aligned rectangle that fits entirely under the skyline.

## Examples
**Example 1**
```
Input:  heights = [2,1,5,6,2,3]
Output: 10
Explanation: The rectangle formed by bars of height 5 and 6 (indices 2-3) has area 5*2=10,
which is the maximum achievable.
```

**Example 2**
```
Input:  heights = [2,4]
Output: 4
Explanation: A single bar of height 4 gives area 4 (or height 2 spanning both bars gives 4).
```

## Constraints
- `1 <= heights.length <= 10^5`
- `0 <= heights[i] <= 10^4`

## Approach 1 — Brute Force
**Idea.** For every bar `i`, treat it as the shortest bar of some rectangle and expand left and right while neighboring bars are `>= heights[i]`. Track the max width found, multiply by `heights[i]`.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int largestRectangleArea(int[] heights) {
        int n = heights.length, best = 0;
        for (int i = 0; i < n; i++) {
            int h = heights[i];
            int left = i, right = i;
            while (left > 0 && heights[left - 1] >= h) left--;
            while (right < n - 1 && heights[right + 1] >= h) right++;
            best = Math.max(best, h * (right - left + 1));
        }
        return best;
    }
}
```

## Approach 2 — Monotonic Increasing Stack (optimal)
**Idea.** Maintain a stack of indices whose heights are strictly increasing. When the current bar is shorter than the bar at the stack's top, the top bar can never extend further right — pop it and compute the rectangle it forms: its height times a width spanning from the (new) element below it on the stack (exclusive) to the current index (exclusive). Append a sentinel `0` height at the end to flush all remaining bars.
**Complexity.** Time O(n) — each index is pushed and popped at most once, Space O(n).
```java
class Solution {
    public int largestRectangleArea(int[] heights) {
        int n = heights.length;
        Deque<Integer> stack = new ArrayDeque<>(); // indices, heights strictly increasing
        int best = 0;
        for (int i = 0; i <= n; i++) {
            int h = (i == n) ? 0 : heights[i];
            while (!stack.isEmpty() && heights[stack.peek()] >= h) {
                int height = heights[stack.pop()];
                int width = stack.isEmpty() ? i : i - stack.peek() - 1;
                best = Math.max(best, height * width);
            }
            stack.push(i);
        }
        return best;
    }
}
```

## Key Takeaways
- The stack always holds indices of bars in strictly increasing height order; popping a bar means "I have found its right boundary (first smaller-or-equal bar)."
- The element left on the stack after popping is exactly the previous strictly-smaller bar — that's the left boundary, giving width `i - stack.peek() - 1`.
- Appending a `0` sentinel avoids special-casing the leftover stack at the end.
- Direct foundation for Maximal Rectangle (per-row histograms) and a template for any "widest span under a constraint" problem.
