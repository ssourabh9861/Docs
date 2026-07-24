# Matchsticks to Square

**Difficulty:** Hard · **Pattern:** subset-sum bucket filling (4-way equal-sum partition) · [LeetCode](https://leetcode.com/problems/matchsticks-to-square/)

## Problem
Given an array `matchsticks` where `matchsticks[i]` is the length of the `i`-th matchstick, determine whether all the matchsticks can be arranged to form a square, using every matchstick exactly once (no breaking sticks).

## Examples
**Example 1**
```
Input:  matchsticks = [1,1,2,2,2]
Output: true
Explanation: total = 8, side = 2; sides can be formed as (2), (2), (2), (1,1).
```
**Example 2**
```
Input:  matchsticks = [3,3,3,3,4]
Output: false
Explanation: total = 16, side = 4; but sticks of length 3 can't combine or stand alone to make 4 evenly across 4 sides given this multiset.
```

## Constraints
- `1 <= matchsticks.length <= 15`
- `1 <= matchsticks[i] <= 10^8`

## Approach 1 — Per-stick bucket assignment (direct backtracking)
**Idea.** This is exactly "Partition to K Equal Sum Subsets" with `k = 4`: compute `total = sum(matchsticks)`; if not divisible by 4, immediately return `false`. Target side length is `total / 4`. Sort descending (place long sticks first so infeasible branches fail fast — a long stick has fewer buckets it can fit into). Maintain `sides[4]`; recursively assign each stick (by index) to a side whose current length plus the stick doesn't exceed the target, recurse to the next stick, and undo the assignment if that path fails.
**Complexity.** Time O(4^n) worst case (n sticks, 4 sides each), heavily pruned by capacity and the descending order, Space O(n) recursion + O(4) side array.
```java
import java.util.*;

class Solution {
    public boolean makesquare(int[] matchsticks) {
        int n = matchsticks.length;
        if (n < 4) return false;

        int total = 0;
        for (int len : matchsticks) total += len;
        if (total % 4 != 0) return false;
        int side = total / 4;

        Integer[] sticks = new Integer[n];
        for (int i = 0; i < n; i++) sticks[i] = matchsticks[i];
        Arrays.sort(sticks, Collections.reverseOrder()); // longest first: fail fast

        if (sticks[0] > side) return false;

        int[] sides = new int[4];
        return backtrack(sticks, 0, sides, side);
    }

    private boolean backtrack(Integer[] sticks, int idx, int[] sides, int side) {
        if (idx == sticks.length) {
            return sides[0] == side && sides[1] == side && sides[2] == side && sides[3] == side;
        }
        int stick = sticks[idx];
        for (int s = 0; s < 4; s++) {
            if (sides[s] + stick > side) continue; // prune: would overflow this side
            // dedup: skip a side whose running length equals one already tried at this depth
            boolean duplicate = false;
            for (int prev = 0; prev < s; prev++) {
                if (sides[prev] == sides[s]) { duplicate = true; break; }
            }
            if (duplicate) continue;

            sides[s] += stick;                    // choose
            if (backtrack(sticks, idx + 1, sides, side)) return true; // explore
            sides[s] -= stick;                     // un-choose
        }
        return false;
    }
}
```

## Approach 2 — Bitmask "used sticks" DFS with memoization (optimal / pruned)
**Idea.** Represent which sticks have been used with an `n`-bit mask. Track `curSide` (length accumulated on the side currently being built) instead of four separate running sums — build one side completely (until `curSide == side`, then start the next with a fresh 0) rather than juggling all four sides' partial states simultaneously. Iterate sticks not yet in the mask; skip a stick if adding it would overflow `side`, and skip repeated stick *values* already tried at the same fill position (skip-equal dedup, same as Combination Sum II / Partition K Equal Subsets). Memoize on the mask (only meaningful at "side boundary" states, i.e., when `curSide == 0`, since the search from a given used-set + side-just-completed is otherwise identical regardless of *how* that used-set was reached) to avoid recomputation of failing configurations.
**Complexity.** Time O(2^n · n) thanks to bitmask memoization, Space O(2^n) memo + O(n) recursion.
```java
import java.util.*;

class Solution {
    private int[] sticks;
    private int n, side;
    private Boolean[] memo; // memo[mask] = can the sticks marked available in `mask` complete the remaining sides?

    public boolean makesquare(int[] matchsticks) {
        n = matchsticks.length;
        if (n < 4) return false;
        int total = 0;
        for (int len : matchsticks) total += len;
        if (total % 4 != 0) return false;
        side = total / 4;

        sticks = matchsticks.clone();
        Arrays.sort(sticks); // ascending; helps skip-equal check using index comparison
        if (sticks[n - 1] > side) return false;

        memo = new Boolean[1 << n];
        return dfs((1 << n) - 1, 0, 4);
    }

    // available: bitmask of stick indices NOT yet placed. curSide: running length of the side being built.
    // sidesLeft: how many full sides still need to be completed.
    private boolean dfs(int available, int curSide, int sidesLeft) {
        if (sidesLeft == 0) return available == 0; // all sides done iff all sticks used
        if (curSide == side) return dfs(available, 0, sidesLeft - 1); // this side is complete; start next

        if (curSide == 0 && memo[available] != null) return memo[available];

        boolean found = false;
        int lastTried = -1;
        for (int i = 0; i < n; i++) {
            if ((available & (1 << i)) == 0) continue;        // already used
            if (sticks[i] == lastTried) continue;               // skip-equal sibling at this depth
            if (curSide + sticks[i] > side) continue;          // prune: would overflow this side

            lastTried = sticks[i];
            if (dfs(available & ~(1 << i), curSide + sticks[i], sidesLeft)) {
                found = true;
                break;
            }
        }

        if (curSide == 0) memo[available] = found;
        return found;
    }
}
```

## Key Takeaways
- Matchsticks to Square is a direct special case of Partition to K Equal Sum Subsets with `k = 4` — recognizing that reduction immediately gives you the algorithm.
- Sorting sticks descending and bailing out early if the longest stick exceeds the target side length is a crucial prune; without it, the search wastes time on branches that are provably impossible before even starting.
- The "skip a bucket/side whose running sum duplicates one already tried at this recursion depth" prune eliminates symmetric branches (four empty sides are interchangeable, so trying the same stick in "side 0" and then again in an identically-empty "side 1" is redundant work).
- The bitmask + memoization version (Approach 2) is the standard way to push this class of problem (bucket-filling subset-sum) from an exponential-in-buckets search to one bounded by `O(2^n)` over the sticks, which matters more as `k` grows relative to `n` — though for exactly `k=4` with `n<=15`, either approach comfortably passes.
