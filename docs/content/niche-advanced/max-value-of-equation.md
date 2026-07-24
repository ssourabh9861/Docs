# Max Value of Equation

**Difficulty:** Hard · **Pattern:** Monotonic decreasing deque keyed on `y - x` · [LeetCode](https://leetcode.com/problems/max-value-of-equation/)

## Problem
Given points sorted by strictly increasing x-coordinate as `points[i] = [xi, yi]`, and an integer `k`, find the maximum value of `yi + yj + |xi - xj|` over all pairs `i < j` with `xj - xi <= k`.

## Examples
**Example 1**
```
Input:  points = [[1,3],[2,0],[5,10],[6,-10]], k = 1
Output: 4
Explanation: Only (0,1) and (2,3) satisfy xj - xi <= 1. Best is points 0,1: 3+0+|1-2| = 4.
```

## Constraints
- 2 <= points.length <= 10^5
- points[i].length == 2
- -10^8 <= xi, yi <= 10^8
- 0 <= k <= 2*10^8
- xi < xi+1 for all valid i (strictly increasing x)

## Approach 1 — Brute force pairs
**Idea.** Since x is strictly increasing, `|xi - xj| = xj - xi` for `i < j`. Check every pair `i < j` with `xj - xi <= k` directly.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int findMaxValueOfEquation(int[][] points, int k) {
        int n = points.length;
        int best = Integer.MIN_VALUE;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                int dx = points[j][0] - points[i][0];
                if (dx > k) break; // x strictly increasing -> further j only worse
                int value = points[i][1] + points[j][1] + dx;
                best = Math.max(best, value);
            }
        }
        return best;
    }
}
```

## Approach 2 — Monotonic deque on `y - x` (optimal)
**Idea.** Since x is increasing, for `i < j`: `yi + yj + (xj - xi) = (yi - xi) + (yj + xj)`. Fix `j` as the right point; we want the maximum `(yi - xi)` among valid `i` with `xj - xi <= k`, i.e., `xi >= xj - k`. Process points left to right, maintaining a deque of previous indices with `yi - xi` values in decreasing order:
1. Evict front indices with `xi < xj - k` (out of range for the current `j`).
2. If non-empty, the front gives the best `yi - xi`; combine with `yj + xj` to update the answer.
3. Evict back indices whose `y - x` is `<= yj - xj` (current point dominates them for all future queries), then push `j`.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int findMaxValueOfEquation(int[][] points, int k) {
        Deque<int[]> dq = new ArrayDeque<>(); // [x, y - x], decreasing by y - x
        int best = Integer.MIN_VALUE;

        for (int[] p : points) {
            int x = p[0], y = p[1];

            while (!dq.isEmpty() && x - dq.peekFirst()[0] > k) {
                dq.pollFirst();
            }
            if (!dq.isEmpty()) {
                best = Math.max(best, dq.peekFirst()[1] + y + x);
            }

            int curScore = y - x;
            while (!dq.isEmpty() && dq.peekLast()[1] <= curScore) {
                dq.pollLast();
            }
            dq.offerLast(new int[]{x, curScore});
        }
        return best;
    }
}
```

## Key Takeaways
- Splitting `yi + yj + |xi - xj|` into independent per-point terms `(yi - xi)` and `(yj + xj)` turns a pairwise constraint into a single running-max query — the standard trick for "optimize a sum of a function of two indices."
- The deque is monotone in `y - x` (decreasing), not in `x` or `y` alone; eviction at the back uses `<=` so equal-score older points are dropped in favor of newer (always-valid-longer) ones.
- Front eviction encodes the sliding window constraint `xj - xi <= k`, exactly like Sliding Window Maximum but on a value derived from two coordinates.
