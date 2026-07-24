# Minimize Max Distance to Gas Station

**Difficulty:** Hard · **Pattern:** Binary search on the answer (real-valued, feasibility predicate) · [LeetCode](https://leetcode.com/problems/minimize-max-distance-to-gas-station/)

## Problem
Given `stations`, sorted positions of existing gas stations on a number line, and an integer `k`, add `k` new gas stations anywhere (not necessarily at integer positions) to minimize the largest distance between adjacent stations. Return that minimized maximum distance.

## Examples
**Example 1**
```
Input:  stations = [1,2,3,4,5,6,7,8,9,10], k = 9
Output: 0.5
Explanation: Adding one station in the middle of each of the 9 unit gaps halves every gap to 0.5.
```
**Example 2**
```
Input:  stations = [0,10,20], k = 1
Output: 5.0
Explanation: Split the larger gap (0-10 or 10-20, tie) in half by adding 1 station.
```

## Constraints
- `10 <= stations.length <= 2000`
- `0 <= stations[i] <= 10^8`, strictly increasing
- `1 <= k <= 10^6`
- Answers within `10^-6` of the true value are accepted.

## Approach 1 — Greedy max-heap (repeatedly split the largest gap)
**Idea.** Track each original gap's length and how many parts it's currently divided into (`length / parts` = current sub-gap size). Use a max-heap keyed by current sub-gap size; `k` times, pop the largest sub-gap, increment its part count (i.e., add one station to that gap), and push it back. After `k` insertions, the heap's max is the answer.
**Complexity.** Time O((n + k) log n), Space O(n). Too slow when `k` is up to 10^6 combined with repeated heap operations if `k` is very large relative to precision needs — and it doesn't generalize well when `k` is huge (e.g., 10^9 in variants).
```java
class Solution {
    public double minmaxGasDist(int[] stations, int k) {
        int n = stations.length;
        double[] gaps = new double[n - 1];
        for (int i = 0; i < n - 1; i++) gaps[i] = stations[i + 1] - stations[i];

        // max-heap of [currentSubGapSize, gapIndex, partsCount]
        PriorityQueue<double[]> heap = new PriorityQueue<>((a, b) -> Double.compare(b[0], a[0]));
        for (int i = 0; i < gaps.length; i++) heap.offer(new double[]{gaps[i], i, 1});

        for (int i = 0; i < k; i++) {
            double[] top = heap.poll();
            int gapIdx = (int) top[1];
            int parts = (int) top[2] + 1;
            heap.offer(new double[]{gaps[gapIdx] / parts, gapIdx, parts});
        }
        return heap.peek()[0];
    }
}
```

## Approach 2 — Binary search on the answer (optimal)
**Idea.** Binary search the maximum allowed sub-gap length `mid` (a real number) in `[0, maxGap]`. **Predicate** `feasible(mid)`: for each original gap of length `g`, the minimum number of extra stations needed to make every sub-gap `<= mid` is `ceil(g / mid) - 1`; sum this over all gaps and check the total is `<= k`. Larger `mid` requires fewer stations per gap, so the predicate is monotonic. Because the answer is a real number, iterate a fixed number of times (or until the interval shrinks below `1e-6`) rather than using integer convergence.
**Complexity.** Time O(n log(maxGap / eps)), Space O(1).
```java
class Solution {
    public double minmaxGasDist(int[] stations, int k) {
        int n = stations.length;
        double[] gaps = new double[n - 1];
        double maxGap = 0;
        for (int i = 0; i < n - 1; i++) {
            gaps[i] = stations[i + 1] - stations[i];
            maxGap = Math.max(maxGap, gaps[i]);
        }

        double lo = 0, hi = maxGap;
        double eps = 1e-6;
        while (hi - lo > eps) {
            double mid = (lo + hi) / 2;
            if (feasible(gaps, k, mid)) {
                hi = mid;       // mid achievable with <= k stations, try smaller
            } else {
                lo = mid;       // need more stations than allowed, mid too small
            }
        }
        return lo;
    }

    // minimum stations needed so every sub-gap <= maxAllowed, compared against budget k
    private boolean feasible(double[] gaps, int k, double maxAllowed) {
        long needed = 0;
        for (double g : gaps) {
            needed += (long) Math.ceil(g / maxAllowed) - 1;
            if (needed > k) return false;
        }
        return needed <= k;
    }
}
```

## Key Takeaways
- Real-valued binary search: loop while `hi - lo > epsilon` (or a fixed ~50 iterations) instead of integer `lo < hi`; there's no exact "smallest feasible integer" here.
- Feasibility predicate cost per gap: `ceil(g / mid) - 1` stations, a direct consequence of wanting every sub-gap `<= mid`.
- The greedy heap approach is intuitive but scales with `k`, which can be up to 10^6 — binary search decouples cost from `k` entirely, checking feasibility in O(n) regardless of how large `k` is.
- Related: Aggressive Cows / Magnetic Force Between Balls (same "space out points to satisfy a distance constraint" family, but discrete positions and maximize-min instead of minimize-max).
