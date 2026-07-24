# Minimum Number of Arrows to Burst Balloons

**Difficulty:** Medium · **Pattern:** greedy, sort by end coordinate · [LeetCode](https://leetcode.com/problems/minimum-number-of-arrows-to-burst-balloons/)

## Problem
Balloons are represented as horizontal diameter intervals `[x_start, x_end]` on the x-axis. An arrow shot straight up at position x bursts every balloon whose interval contains x. Find the minimum number of arrows needed to burst all balloons.

## Examples
**Example 1**
```
Input:  points = [[10,16],[2,8],[1,6],[7,12]]
Output: 2
Explanation: One arrow at x=6 bursts [2,8] and [1,6]; another at x=11 bursts [10,16] and [7,12].
```

**Example 2**
```
Input:  points = [[1,2],[3,4],[5,6],[7,8]]
Output: 4
Explanation: No two balloons overlap, so each needs its own arrow.
```

## Constraints
- 1 <= points.length <= 10^5
- points[i].length == 2
- -2^31 <= x_start < x_end <= 2^31 - 1

## Approach 1 — Sort by start, track overlap with min end (works but reason more carefully)
**Idea.** Sort by start coordinate. Keep the current arrow's effective position as the minimum end seen among the overlapping group so far. If the next balloon's start exceeds that minimum end, it needs a new arrow. This mirrors the interval-scheduling greedy but sorting by start requires tracking the running minimum end rather than just the last end.
**Complexity.** Time O(n log n), Space O(1) extra.
```java
class Solution {
    public int findMinArrowShots(int[][] points) {
        if (points.length == 0) return 0;
        Arrays.sort(points, (a, b) -> Integer.compare(a[0], b[0]));
        int arrows = 1;
        long minEnd = points[0][1];
        for (int i = 1; i < points.length; i++) {
            if (points[i][0] > minEnd) {
                arrows++;
                minEnd = points[i][1];
            } else {
                minEnd = Math.min(minEnd, points[i][1]);
            }
        }
        return arrows;
    }
}
```

## Approach 2 — Sort by end coordinate, one arrow per non-overlapping group (optimal)
**Idea.** Sort balloons by their end coordinate. Shoot the first arrow at the end of the first balloon. Any subsequent balloon whose start is <= that arrow's position is already burst by it (skip). The first balloon whose start exceeds the current arrow position needs a new arrow, placed at its end. This is the cleanest form of the greedy: exactly the same structure as Non-overlapping Intervals, where "arrows needed" = "maximum count of mutually non-overlapping intervals."
**Complexity.** Time O(n log n) for the sort, Space O(1) extra.
```java
class Solution {
    public int findMinArrowShots(int[][] points) {
        if (points.length == 0) return 0;
        Arrays.sort(points, (a, b) -> Long.compare(a[1], b[1]));

        int arrows = 1;
        long arrowPos = points[0][1];
        for (int i = 1; i < points.length; i++) {
            if (points[i][0] > arrowPos) {
                arrows++;
                arrowPos = points[i][1];
            }
        }
        return arrows;
    }
}
```

## Key Takeaways
- Minimum arrows equals the maximum number of pairwise non-overlapping intervals — the same greedy skeleton as Non-overlapping Intervals, just phrased as "count kept" instead of "count removed."
- Sort by **end** coordinate to make the greedy a single clean forward scan; sorting by start still works but forces you to track a running minimum end.
- Watch overflow: with bounds up to 2^31 - 1, use `long` for comparisons/end tracking in Java to avoid integer overflow surprises.
