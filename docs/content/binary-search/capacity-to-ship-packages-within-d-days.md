# Capacity To Ship Packages Within D Days

**Difficulty:** Medium · **Pattern:** Binary search on the answer (feasibility predicate) · [LeetCode](https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/)

## Problem
Given `weights` of packages that must be shipped in order over `days` days, and a ship that carries `weights` in daily batches without exceeding its capacity, find the minimum ship capacity that ships all packages within `days` days.

## Examples
**Example 1**
```
Input:  weights = [1,2,3,4,5,6,7,8,9,10], days = 5
Output: 15
Explanation: Split as [1,2,3,4,5],[6,7],[8],[9],[10] with capacity 15.
```
**Example 2**
```
Input:  weights = [3,2,2,4,1,4], days = 3
Output: 6
Explanation: [3,2],[2,4],[1,4] all fit within capacity 6.
```

## Constraints
- `1 <= days <= weights.length <= 5 * 10^4`
- `1 <= weights[i] <= 500`

## Approach 1 — Brute-force capacity scan
**Idea.** Try every capacity starting from `max(weights)` upward, and for each compute the number of days needed with a greedy fill; return the first capacity that fits in `days`.
**Complexity.** Time O(n * (sum - max)) worst case, Space O(1). Too slow for large sums.
```java
class Solution {
    public int shipWithinDays(int[] weights, int days) {
        int cap = 0, sum = 0;
        for (int w : weights) { cap = Math.max(cap, w); sum += w; }
        for (int c = cap; c <= sum; c++) {
            if (daysNeeded(weights, c) <= days) return c;
        }
        return sum;
    }
    private int daysNeeded(int[] weights, int cap) {
        int days = 1, curr = 0;
        for (int w : weights) {
            if (curr + w > cap) { days++; curr = 0; }
            curr += w;
        }
        return days;
    }
}
```

## Approach 2 — Binary search on the answer (optimal)
**Idea.** Binary search the ship capacity `mid` in `[max(weights), sum(weights)]`. **Predicate** `feasible(mid)`: greedily load packages in order onto the ship, starting a new day whenever the next package would exceed `mid`; feasible iff `days used <= days`. Larger capacity always needs fewer-or-equal days, so the predicate is monotonic — binary search for the smallest feasible capacity.
**Complexity.** Time O(n * log(sum(weights))), Space O(1).
```java
class Solution {
    public int shipWithinDays(int[] weights, int days) {
        int lo = 0, hi = 0;
        for (int w : weights) { lo = Math.max(lo, w); hi += w; }

        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (feasible(weights, days, mid)) {
                hi = mid;       // capacity works, try smaller
            } else {
                lo = mid + 1;   // need more capacity
            }
        }
        return lo;
    }

    private boolean feasible(int[] weights, int days, int capacity) {
        int daysUsed = 1, curr = 0;
        for (int w : weights) {
            if (curr + w > capacity) {
                daysUsed++;
                curr = 0;
                if (daysUsed > days) return false;
            }
            curr += w;
        }
        return true;
    }
}
```

## Key Takeaways
- Identical template to Split Array Largest Sum: the "days needed for a given capacity" greedy check is the feasibility predicate; capacity is the binary-searched answer.
- Lower bound must be `max(weights)` (a single package can't be split across days), upper bound is `sum(weights)` (ship everything in one day).
- The order constraint (ship in given order) is what makes the greedy day-count check correct — no need to reorder or use DP.
- Related: Koko Eating Bananas, Split Array Largest Sum — same "minimize the max resource under a count/day constraint" shape.
