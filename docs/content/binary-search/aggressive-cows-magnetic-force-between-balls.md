# Aggressive Cows / Magnetic Force Between Two Balls

**Difficulty:** Hard (GfG/Codeforces classic; LeetCode variant: Magnetic Force Between Two Balls, Medium) · **Pattern:** Binary search on the answer, maximize the minimum distance (feasibility predicate) · [LeetCode](https://leetcode.com/problems/magnetic-force-between-two-balls/)

## Problem
Given `position`, the positions of `n` baskets (or stalls), place `m` balls (or cows) into baskets such that the minimum distance between any two placed balls is as large as possible. Return that maximized minimum distance.

## Examples
**Example 1**
```
Input:  position = [1,2,3,4,7], m = 3
Output: 3
Explanation: Place balls at 1, 4, 7 -> min pairwise gap = 3, the largest achievable.
```
**Example 2**
```
Input:  position = [5,4,3,2,1,1000000000], m = 2
Output: 999999999
Explanation: Place balls at 1 and 1000000000 -> gap = 999999999.
```

## Constraints
- `n == position.length`
- `2 <= n <= 10^5`
- `1 <= position[i] <= 10^9`
- `2 <= m <= position.length`

## Approach 1 — Try every candidate distance linearly
**Idea.** Sort positions. For each candidate distance `d` from `1` up to `maxPos - minPos`, greedily place balls (start at the first position, place the next ball only once the gap from the last placed ball is `>= d`) and count how many balls fit; find the largest `d` for which the count is `>= m`.
**Complexity.** Time O(n * maxDistance), Space O(1) extra (after sort). Far too slow for `position[i]` up to 10^9.
```java
class Solution {
    public int maxDistance(int[] position, int m) {
        Arrays.sort(position);
        int n = position.length;
        int maxGap = position[n - 1] - position[0];
        int best = 1;
        for (int d = 1; d <= maxGap; d++) {
            if (countPlaced(position, d) >= m) best = d;
        }
        return best;
    }
    private int countPlaced(int[] position, int d) {
        int count = 1, last = position[0];
        for (int i = 1; i < position.length; i++) {
            if (position[i] - last >= d) { count++; last = position[i]; }
        }
        return count;
    }
}
```

## Approach 2 — Binary search on the answer (optimal)
**Idea.** Sort positions. Binary search the candidate minimum distance `mid` in `[1, maxPos - minPos]`. **Predicate** `canPlace(mid)`: greedily place the first ball at `position[0]`; scan forward, placing the next ball whenever the current position is at least `mid` away from the last placed ball; feasible iff the total balls placed is `>= m`. As `mid` increases, fewer balls can be placed (monotonically non-increasing), so this is a "maximize the minimum" binary search — find the largest `mid` where `canPlace(mid)` is true.
**Complexity.** Time O(n log(maxDistance)), Space O(1) extra.
```java
class Solution {
    public int maxDistance(int[] position, int m) {
        Arrays.sort(position);
        int n = position.length;
        int lo = 1, hi = position[n - 1] - position[0];

        while (lo < hi) {
            // bias mid upward to avoid infinite loop when searching for the largest feasible value
            int mid = lo + (hi - lo + 1) / 2;
            if (canPlace(position, m, mid)) {
                lo = mid;       // mid works, try for an even larger min distance
            } else {
                hi = mid - 1;   // mid too large, can't fit m balls
            }
        }
        return lo;
    }

    // true if m balls can be placed with every pairwise gap >= minDist
    private boolean canPlace(int[] position, int m, int minDist) {
        int count = 1, last = position[0];
        for (int i = 1; i < position.length; i++) {
            if (position[i] - last >= minDist) {
                count++;
                last = position[i];
                if (count >= m) return true;
            }
        }
        return count >= m;
    }
}
```

## Key Takeaways
- This is "maximize the minimum" — the mirror image of "minimize the maximum" (Koko, Split Array). Binary search the same way, but bias `mid` toward `hi` (`(lo + hi + 1) / 2`) and move `lo = mid` on success so the loop doesn't stall.
- Predicate: greedily place the next item as soon as the gap requirement is met — greedy placement (not evenly spacing) is provably optimal for maximizing the minimum gap.
- Sort first — required for both the greedy predicate and to establish the `[1, max-min]` search bounds.
- Related: Minimize Max Distance to Gas Station (minimize-max sibling), Capacity to Ship Packages / Koko Eating Bananas (minimize-max template using the opposite `lo=mid+1 / hi=mid` convention).
