# Koko Eating Bananas

**Difficulty:** Medium · **Pattern:** Binary search on the answer (feasibility predicate) · [LeetCode](https://leetcode.com/problems/koko-eating-bananas/)

## Problem
Koko has `piles` of bananas and `h` hours before the guards return. Each hour she picks one pile and eats up to `k` bananas from it (if the pile has fewer than `k`, she finishes it and stops that hour). Find the minimum integer eating speed `k` so she finishes all piles within `h` hours.

## Examples
**Example 1**
```
Input:  piles = [3,6,7,11], h = 8
Output: 4
Explanation: At speed 4: ceil(3/4)+ceil(6/4)+ceil(7/4)+ceil(11/4) = 1+2+2+3 = 8 hours.
```
**Example 2**
```
Input:  piles = [30,11,23,4,20], h = 5
Output: 30
Explanation: With only 5 hours for 5 piles, she must finish each pile in one hour.
```

## Constraints
- `1 <= piles.length <= 10^4`
- `piles.length <= h <= 10^9`
- `1 <= piles[i] <= 10^9`

## Approach 1 — Brute-force speed scan
**Idea.** Try every speed from 1 up to `max(piles)`, compute hours needed via `sum(ceil(pile / speed))`, and return the first speed that fits within `h`.
**Complexity.** Time O(n * max(piles)), Space O(1). Too slow when piles are large.
```java
class Solution {
    public int minEatingSpeed(int[] piles, int h) {
        int maxPile = 0;
        for (int p : piles) maxPile = Math.max(maxPile, p);
        for (int speed = 1; speed <= maxPile; speed++) {
            if (hoursNeeded(piles, speed) <= h) return speed;
        }
        return maxPile;
    }
    private long hoursNeeded(int[] piles, int speed) {
        long hours = 0;
        for (int p : piles) hours += (p + speed - 1) / speed;
        return hours;
    }
}
```

## Approach 2 — Binary search on the answer (optimal)
**Idea.** Binary search the eating speed `mid` in `[1, max(piles)]`. **Predicate** `canFinish(mid)`: total hours = `sum(ceil(pile / mid))` for all piles; feasible iff this total is `<= h`. As speed increases, hours needed only decreases (monotonic), so binary search for the smallest feasible speed.
**Complexity.** Time O(n * log(max(piles))), Space O(1).
```java
class Solution {
    public int minEatingSpeed(int[] piles, int h) {
        int lo = 1, hi = 0;
        for (int p : piles) hi = Math.max(hi, p);

        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (canFinish(piles, h, mid)) {
                hi = mid;       // speed works, try slower
            } else {
                lo = mid + 1;   // too slow, speed up
            }
        }
        return lo;
    }

    private boolean canFinish(int[] piles, int h, int speed) {
        long hours = 0;
        for (int p : piles) {
            hours += (p + speed - 1) / speed; // ceil division
            if (hours > h) return false; // early exit, avoids overflow accumulation
        }
        return hours <= h;
    }
}
```

## Key Takeaways
- `ceil(a / b)` in integer arithmetic is `(a + b - 1) / b` — memorize this, it recurs across every "minimize rate" binary search problem.
- Search space is speed `[1, max(piles)]`; predicate cost is O(n), giving O(n log(max(piles))) total — a huge win over the O(n * max(piles)) brute force.
- Early-exit the hour accumulation once it exceeds `h` to avoid unnecessary work (and potential overflow with large `h` up to 1e9).
- Same skeleton as Capacity to Ship Packages and Split Array Largest Sum: minimize a resource cap subject to a count constraint.
