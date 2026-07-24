# Maximal Rectangle

**Difficulty:** Hard · **Pattern:** per-row histogram reduced to Largest Rectangle in Histogram (monotonic stack) · [LeetCode](https://leetcode.com/problems/maximal-rectangle/)

## Problem
Given a `rows x cols` binary matrix filled with `'0'` and `'1'`, find the area of the largest rectangle containing only `'1'`s.

## Examples
**Example 1**
```
Input:  matrix = [["1","0","1","0","0"],
                   ["1","0","1","1","1"],
                   ["1","1","1","1","1"],
                   ["1","0","0","1","0"]]
Output: 6
Explanation: The largest rectangle of 1's is in rows 1-2, columns 2-4 (3 wide, 2 tall) -> area 6.
```

**Example 2**
```
Input:  matrix = [["0"]]
Output: 0
```

## Constraints
- `rows == matrix.length`, `cols == matrix[i].length`
- `1 <= rows, cols <= 200`
- `matrix[i][j]` is `'0'` or `'1'`

## Approach 1 — Brute Force
**Idea.** For every pair of rows and every column range, check if the sub-rectangle is all `'1'`s. Extremely slow; only useful to state the baseline. A slightly better brute force precomputes, for each cell, the run of consecutive 1's upward, then for each row treats that as a histogram and does an O(cols^2) scan per row.
**Complexity.** Time O(rows * cols^2) with the histogram precomputation, Space O(cols).
```java
class Solution {
    public int maximalRectangle(char[][] matrix) {
        int rows = matrix.length, cols = matrix[0].length;
        int[] heights = new int[cols];
        int best = 0;
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                heights[c] = matrix[r][c] == '1' ? heights[c] + 1 : 0;
            }
            // O(cols^2) scan of this row's histogram
            for (int i = 0; i < cols; i++) {
                int minH = Integer.MAX_VALUE;
                for (int j = i; j < cols; j++) {
                    minH = Math.min(minH, heights[j]);
                    if (minH == 0) break;
                    best = Math.max(best, minH * (j - i + 1));
                }
            }
        }
        return best;
    }
}
```

## Approach 2 — Row-wise Histogram + Monotonic Stack (optimal)
**Idea.** Build a running "heights" array: `heights[c]` is the number of consecutive `'1'`s ending at the current row in column `c` (reset to 0 on a `'0'`). After updating the heights array for each row, that row's histogram's largest rectangle is exactly the Largest Rectangle in Histogram problem, solved in O(cols) with a monotonic increasing stack. Run this for every row and keep the max.
**Complexity.** Time O(rows * cols) — each row runs the O(cols) stack scan, Space O(cols).
```java
class Solution {
    public int maximalRectangle(char[][] matrix) {
        if (matrix.length == 0 || matrix[0].length == 0) return 0;
        int cols = matrix[0].length;
        int[] heights = new int[cols];
        int best = 0;
        for (char[] row : matrix) {
            for (int c = 0; c < cols; c++) {
                heights[c] = row[c] == '1' ? heights[c] + 1 : 0;
            }
            best = Math.max(best, largestRectangleArea(heights));
        }
        return best;
    }

    private int largestRectangleArea(int[] heights) {
        int n = heights.length;
        Deque<Integer> stack = new ArrayDeque<>();
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
- Turn a 2D "all-ones rectangle" problem into `rows` independent 1D histogram problems by accumulating column heights row by row.
- Reuse the exact Largest Rectangle in Histogram stack routine unchanged — recognizing this reduction is the whole trick.
- A `'0'` resets that column's height to 0, correctly breaking any rectangle that would have spanned it.
- Related: Largest Rectangle in Histogram (the core subroutine), Maximal Square (same matrix but DP-based, different objective).
