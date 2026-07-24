# Max Points on a Line

**Difficulty:** Hard · **Pattern:** Fix a point, bucket the rest by gcd-normalized slope in a HashMap · [LeetCode](https://leetcode.com/problems/max-points-on-a-line/)

## Problem
Given an array of points on the X-Y plane, return the maximum number of points that lie on the same straight line.

## Examples
**Example 1**
```
Input:  points = [[1,1],[2,2],[3,3]]
Output: 3
Explanation: All three points are collinear (on y = x).
```

**Example 2**
```
Input:  points = [[1,1],[3,2],[5,3],[4,1],[2,3],[1,4]]
Output: 4
```

## Constraints
- `1 <= points.length <= 300`
- `points[i].length == 2`
- `-10^4 <= xi, yi <= 10^4`
- All the `points` are **unique**.

## Approach 1 — Brute force triple check
**Idea.** For every triple of points, check collinearity via the cross-product condition `(y2-y1)*(x3-x1) == (y3-y1)*(x2-x1)`. Correct but O(n^3), too slow even for n = 300 in the worst framing of "count max on any line" without further structure — included as the naive baseline.
**Complexity.** Time O(n^3), Space O(1).
```java
class Solution {
    public int maxPoints(int[][] points) {
        int n = points.length;
        if (n <= 2) return n;

        int best = 2;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                int count = 2;
                for (int k = j + 1; k < n; k++) {
                    long cross = (long) (points[j][1] - points[i][1]) * (points[k][0] - points[i][0])
                               - (long) (points[k][1] - points[i][1]) * (points[j][0] - points[i][0]);
                    if (cross == 0) count++;
                }
                best = Math.max(best, count);
            }
        }
        return best;
    }
}
```

## Approach 2 — Fix each point, bucket others by normalized slope (optimal)
**Idea.** For each point `p`, group every other point `q` by the reduced-fraction slope `(dy/gcd, dx/gcd)` from `p` to `q`. Points sharing the same normalized slope relative to `p` are collinear with `p`. Using `gcd` avoids floating-point slope comparisons (which suffer precision issues, especially with vertical lines and repeating decimals); fix the sign convention (e.g. always keep `dx >= 0`, flipping both signs if `dx < 0`, and specially normalize the vertical case `dx == 0`) so that equivalent slopes hash identically. Take the max bucket size + 1 (for `p` itself) over all `p`, then the overall max across all `p`.
**Complexity.** Time O(n^2), Space O(n) per iteration for the slope map.
```java
import java.util.HashMap;
import java.util.Map;

class Solution {
    public int maxPoints(int[][] points) {
        int n = points.length;
        if (n <= 2) return n;

        int best = 1;
        for (int i = 0; i < n; i++) {
            Map<Long, Integer> slopeCount = new HashMap<>();
            int localMax = 0;
            for (int j = 0; j < n; j++) {
                if (j == i) continue;
                int dx = points[j][0] - points[i][0];
                int dy = points[j][1] - points[i][1];

                int g = gcd(Math.abs(dx), Math.abs(dy));
                if (g != 0) {
                    dx /= g;
                    dy /= g;
                }
                // Normalize sign so the same line always hashes the same key:
                // force dx >= 0, and if dx == 0 (vertical line) force dy > 0.
                if (dx < 0 || (dx == 0 && dy < 0)) {
                    dx = -dx;
                    dy = -dy;
                }

                long key = (long) dx * 40001L + dy; // combine into one hashable key (dy range fits safely)
                int updated = slopeCount.merge(key, 1, Integer::sum);
                localMax = Math.max(localMax, updated);
            }
            best = Math.max(best, localMax + 1); // +1 for point i itself
        }
        return best;
    }

    private int gcd(int a, int b) {
        while (b != 0) {
            int t = b;
            b = a % b;
            a = t;
        }
        return a;
    }
}
```

## Key Takeaways
- Reducing `(dx, dy)` by their `gcd` and fixing a sign convention gives an exact, hashable slope representation — avoiding floating-point comparison pitfalls entirely.
- Fixing each point as the pivot and bucketing the rest by slope turns an O(n^3) triple-checking problem into O(n^2).
- Special-case `dx == 0` (vertical lines) and duplicate points (which the constraints here rule out, but which real-world variants must handle by folding into every line through that point) when adapting this pattern.
