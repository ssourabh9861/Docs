# Rectangle Area II

**Difficulty:** Hard · **Pattern:** Coordinate compression + line sweep over vertical strips with merged active intervals · [LeetCode](https://leetcode.com/problems/rectangle-area-ii/)

## Problem
Given axis-aligned rectangles `rectangles[i] = [x1, y1, x2, y2]`, return the total area covered by at least one rectangle, modulo `10^9 + 7`. Overlapping regions must be counted only once.

## Examples
**Example 1**
```
Input:  rectangles = [[0,0,2,2],[1,0,2,3],[1,0,3,1]]
Output: 6
Explanation: The union of the three rectangles covers area 6 (overlaps counted once).
```

## Constraints
- 1 <= rectangles.length <= 200
- rectangles[i].length == 4
- 0 <= xi1, yi1, xi2, yi2 <= 10^9
- xi1 < xi2, yi1 < yi2

## Approach 1 — Coordinate compression grid, mark covered cells
**Idea.** Collect all distinct x-coordinates and all distinct y-coordinates, sort each. This partitions the plane into a grid of at most 200x200 cells. For every rectangle, mark every grid cell it fully covers as "covered." Sum the areas of covered cells (using actual coordinate gaps, not cell counts).
**Complexity.** Time O(n^3) (n rectangles times n^2 grid cells), Space O(n^2).
```java
import java.util.Arrays;
import java.util.TreeMap;

class Solution {
    public int rectangleArea(int[][] rectangles) {
        final int MOD = 1_000_000_007;
        int n = rectangles.length;

        int[] xs = new int[2 * n];
        int[] ys = new int[2 * n];
        for (int i = 0; i < n; i++) {
            xs[2 * i] = rectangles[i][0];
            xs[2 * i + 1] = rectangles[i][2];
            ys[2 * i] = rectangles[i][1];
            ys[2 * i + 1] = rectangles[i][3];
        }
        Arrays.sort(xs);
        Arrays.sort(ys);
        int[] ux = dedup(xs);
        int[] uy = dedup(ys);

        boolean[][] covered = new boolean[ux.length - 1][uy.length - 1];
        for (int[] r : rectangles) {
            int xi = lowerBound(ux, r[0]);
            int xj = lowerBound(ux, r[2]);
            int yi = lowerBound(uy, r[1]);
            int yj = lowerBound(uy, r[3]);
            for (int i = xi; i < xj; i++) {
                for (int j = yi; j < yj; j++) {
                    covered[i][j] = true;
                }
            }
        }

        long area = 0;
        for (int i = 0; i < ux.length - 1; i++) {
            long width = ux[i + 1] - ux[i];
            for (int j = 0; j < uy.length - 1; j++) {
                if (covered[i][j]) {
                    area = (area + width * (uy[j + 1] - uy[j])) % MOD;
                }
            }
        }
        return (int) area;
    }

    private int[] dedup(int[] sorted) {
        int k = 0;
        for (int i = 0; i < sorted.length; i++) {
            if (i == 0 || sorted[i] != sorted[i - 1]) sorted[k++] = sorted[i];
        }
        return Arrays.copyOf(sorted, k);
    }

    private int lowerBound(int[] arr, int target) {
        int lo = 0, hi = arr.length;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (arr[mid] < target) lo = mid + 1; else hi = mid;
        }
        return lo;
    }
}
```

## Approach 2 — Sweep over x-strips, merge active y-intervals (optimal)
**Idea.** Sort all distinct x-coordinates. Between each consecutive pair `(ux[i], ux[i+1])`, find every rectangle whose x-range covers this strip (i.e., `x1 <= ux[i]` and `x2 >= ux[i+1]`) and collect their y-intervals. Merge these y-intervals (sort by start, sweep and combine overlaps) to get the total covered height in this strip without double counting. Multiply that height by the strip width and accumulate, mod `10^9+7`. This avoids the O(n^2) grid and instead does O(n) work (interval merge) per strip.
**Complexity.** Time O(n^2 log n) (n strips, each doing an O(n log n) merge), Space O(n).
```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

class Solution {
    public int rectangleArea(int[][] rectangles) {
        final int MOD = 1_000_000_007;
        int n = rectangles.length;

        int[] xs = new int[2 * n];
        for (int i = 0; i < n; i++) {
            xs[2 * i] = rectangles[i][0];
            xs[2 * i + 1] = rectangles[i][2];
        }
        Arrays.sort(xs);

        long area = 0;
        for (int i = 0; i < xs.length - 1; i++) {
            int xLeft = xs[i], xRight = xs[i + 1];
            long width = xRight - xLeft;
            if (width == 0) continue;

            List<int[]> yIntervals = new ArrayList<>();
            for (int[] r : rectangles) {
                if (r[0] <= xLeft && r[2] >= xRight) {
                    yIntervals.add(new int[]{r[1], r[3]});
                }
            }
            if (yIntervals.isEmpty()) continue;

            yIntervals.sort((a, b) -> a[0] - b[0]);
            long height = 0;
            int curStart = yIntervals.get(0)[0];
            int curEnd = yIntervals.get(0)[1];
            for (int k = 1; k < yIntervals.size(); k++) {
                int[] iv = yIntervals.get(k);
                if (iv[0] > curEnd) {
                    height += curEnd - curStart;
                    curStart = iv[0];
                    curEnd = iv[1];
                } else {
                    curEnd = Math.max(curEnd, iv[1]);
                }
            }
            height += curEnd - curStart;

            area = (area + (width % MOD) * (height % MOD)) % MOD;
        }
        return (int) area;
    }
}
```

## Key Takeaways
- Coordinate compression turns a plane of up to 10^9 x 10^9 into a manageable grid of O(n) x O(n) cells derived only from the actual rectangle boundaries.
- The vertical-strip sweep reduces the problem to "merge overlapping intervals" repeated per strip — the height of the union is independent of how many rectangles overlap, only where.
- Always take the modulo after multiplication of `width * height`, and reduce each factor mod `10^9+7` first if they could be large, to avoid overflow before the final cast to `int`.
