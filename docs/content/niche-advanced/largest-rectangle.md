# Largest Rectangle in Histogram

**Difficulty:** Hard · **Pattern:** Monotonic increasing stack of indices · [LeetCode](https://leetcode.com/problems/largest-rectangle-in-histogram/)

## Problem
Given an array `heights` representing bar heights of a histogram with unit width, find the area of the largest rectangle that fits entirely within the histogram.

## Examples
**Example 1**
```
Input:  heights = [2,1,5,6,2,3]
Output: 10
Explanation: The rectangle formed by bars [5,6] (indices 2-3) has height 5 and width 2, area 10.
```

## Constraints
- 1 <= heights.length <= 10^5
- 0 <= heights[i] <= 10^4

## Approach 1 — Brute force expand from each bar
**Idea.** For every bar `i`, treat it as the shortest bar of a rectangle and expand left/right while the neighboring bars are `>= heights[i]`, tracking the resulting width.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int largestRectangleArea(int[] heights) {
        int n = heights.length;
        int best = 0;
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

## Approach 2 — Monotonic increasing stack (optimal)
**Idea.** Scan left to right keeping a stack of indices whose heights are strictly increasing. When the current bar is shorter than the stack's top, the top bar can no longer extend rightward — pop it and finalize its rectangle: its height is `heights[top]`, its right boundary is the current index, and its left boundary is the new stack top (or -1 if empty) plus one. This resolves, for every bar, the exact range where it is the minimum height — the same "next/previous smaller element" idea as a monotonic deque, applied via a stack since we only need one-directional (LIFO) eviction. Append a sentinel `0` at the end to flush all remaining bars.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int largestRectangleArea(int[] heights) {
        int n = heights.length;
        Deque<Integer> stack = new ArrayDeque<>(); // indices, heights increasing
        int best = 0;

        for (int i = 0; i <= n; i++) {
            int h = (i == n) ? 0 : heights[i]; // sentinel flushes the stack
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
- A monotonic stack finds, for each element, the nearest smaller element on both sides in one linear pass — the width of its maximal rectangle is `right - left - 1`.
- Popping a bar means "I have found the first bar to its right that is strictly shorter," which finalizes its right boundary; the new stack top after popping is its left boundary.
- The sentinel value (0, or `-infinity` conceptually) at the end guarantees every remaining bar in the stack gets popped and evaluated.
