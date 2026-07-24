# Minimum Cost to Connect Two Groups of Points

**Difficulty:** Hard · **Pattern:** bitmask DP over (group-1 index, mask of connected group-2 points) · [LeetCode](https://leetcode.com/problems/minimum-cost-to-connect-two-groups-of-points/)

## Problem
Given `cost[i][j]` = cost of connecting point `i` in group 1 to point `j` in group 2, connect every point in group 1 to at least one point in group 2 and vice versa, minimizing total connection cost (a single point may have multiple connections).

## Examples
**Example 1**
```
Input:  cost = [[15,96],[36,2]]
Output: 17
Explanation: Connect group1[0]-group2[1] (cost 96)?? No — optimal: connect
             group1[0]-group2[0] (15) and group1[1]-group2[1] (2): total 17,
             and both groups are fully covered.
```
**Example 2**
```
Input:  cost = [[1,3,5],[4,1,1],[1,5,3]]
Output: 4
Explanation: Connect group1[0]-group2[0] (1), group1[1]-group2[1] (1),
             group1[2]-group2[0] (1), group1[1]-group2[2] (1). Total = 4,
             covering all of group1 and group2. (One valid optimal combination.)
```

## Constraints
- `size1 == cost.length`
- `size2 == cost[i].length`
- `1 <= size1, size2 <= 12`
- `0 <= cost[i][j] <= 100`

## Approach 1 — Brute-force over all subsets of edges (for intuition only)
**Idea.** In principle we could pick any subset of the `size1 * size2` possible edges and check both coverage constraints, keeping the minimum-cost valid subset. This is exponential in the number of edges (`2^(size1*size2)`) and infeasible even for size1=size2=12 (`2^144`), but it clarifies the actual search space before we prune it with DP structure below.

**Complexity.** Time O(2^(size1·size2)) — intractable; shown for contrast only, not meant to run.
```java
// Illustrative only — do not run for size1*size2 beyond ~20.
class BruteForceSketch {
    // For each of the 2^(size1*size2) edge subsets, check group1 and group2
    // coverage bitmasks are both full, track min cost. Infeasible at real
    // constraints; motivates the DP in Approach 2, which fixes group-1's
    // choices row by row and only needs a bitmask over group 2.
}
```

## Approach 2 — DP over (group-1 row index, group-2 covered mask) (optimal)
**Idea.** Process group 1 points one at a time (`i = 0..size1-1`). State `dp[i][mask]` = minimum cost to have processed the first `i` group-1 points and have `mask` = the set of group-2 points already connected to *some* processed group-1 point. At each row `i`, decide the subset of group-2 points `i` connects to (must be non-empty for row `i`'s own coverage, enforced structurally by always allowing single connections and letting the final row see leftover uncovered points). A clean formulation: for row `i`, try connecting it to every non-empty subset of columns — too slow — instead, decompose per-column: `dp[i+1][mask | (1<<j)] = min(dp[i+1][...], dp[i][mask] + cost[i][j])` trying single-edge extensions, **plus** ensure row `i` has at least one edge by only allowing the transition to `i+1` after at least one column was picked for row `i`. The standard efficient recurrence instead fixes: at row `i`, for every possible `mask` transition adding one edge `(i, j)`, plus a special closing step when moving to row `size1` that pays, for every still-uncovered group-2 column `j`, the cheapest edge `min_i cost[i][j]` (since any leftover group-2 point must connect to *some* group-1 point, cheapest is optimal and doesn't force which row "owns" it structurally — it only needs coverage).

Concretely:
- `dp[i][mask]` for `i` in `0..size1`, `mask` in `0..2^size2-1`.
- `dp[0][0] = 0`.
- Transition from `dp[i][mask]`: connect group-1 point `i` to one or more group-2 points; equivalently, try connecting to exactly one column `j` at a time and let repeated single-column transitions within the same row accumulate multiple edges — implemented by allowing `dp[i+1][...]` transitions plus a same-row "add another column" loop, OR more simply: from `dp[i][mask]`, for each `j`, `dp[i+1][mask | (1<<j)] = min(dp[i+1][mask | (1<<j)], dp[i][mask] + cost[i][j])`, then also allow chaining within row `i` by iterating this relaxation until stable for the same `i` (a small inner loop over columns), guaranteeing row `i` can pick a multi-column subset.
- Final answer: `dp[size1][full2]` after also accounting for uncovered leftover columns via `minCostCol[j] = min over i of cost[i][j]` added at the end for any bit missing from the mask reached — precisely, once all `size1` rows are processed, for whatever mask `m` we ended on, the total is `dp[size1][m] + sum over j not in m of minCostCol[j]`, and we minimize over all `m`.

**Complexity.** Time O(size1 · 2^size2 · size2), Space O(size1 · 2^size2).
```java
class Solution {
    public int connectTwoGroups(List<List<Integer>> cost) {
        int size1 = cost.size();
        int size2 = cost.get(0).size();
        int fullMask = (1 << size2) - 1;

        // Cheapest edge into each group-2 column, over all group-1 rows.
        int[] minCostCol = new int[size2];
        Arrays.fill(minCostCol, Integer.MAX_VALUE);
        for (int i = 0; i < size1; i++) {
            for (int j = 0; j < size2; j++) {
                minCostCol[j] = Math.min(minCostCol[j], cost.get(i).get(j));
            }
        }

        int[][] dp = new int[size1 + 1][1 << size2];
        for (int[] row : dp) Arrays.fill(row, -1);
        dp[0][0] = 0;

        for (int i = 0; i < size1; i++) {
            for (int mask = 0; mask <= fullMask; mask++) {
                if (dp[i][mask] == -1) continue;
                int base = dp[i][mask];
                // Row i connects to exactly one column j; chaining multiple
                // single-edge relaxations across masks lets row i effectively
                // pick a multi-column subset by revisiting dp[i][...] states
                // reached via extra bits before moving to i+1.
                for (int j = 0; j < size2; j++) {
                    int newMask = mask | (1 << j);
                    int candidate = base + cost.get(i).get(j);
                    // Option A: this is row i's only edge -> advance to row i+1.
                    if (dp[i + 1][newMask] == -1 || dp[i + 1][newMask] > candidate) {
                        dp[i + 1][newMask] = candidate;
                    }
                    // Option B: row i takes another edge too -> stay on row i.
                    if (dp[i][newMask] == -1 || dp[i][newMask] > candidate) {
                        dp[i][newMask] = candidate;
                    }
                }
            }
        }

        int ans = Integer.MAX_VALUE;
        for (int mask = 0; mask <= fullMask; mask++) {
            if (dp[size1][mask] == -1) continue;
            int total = dp[size1][mask];
            for (int j = 0; j < size2; j++) {
                if ((mask & (1 << j)) == 0) {
                    total += minCostCol[j];
                }
            }
            ans = Math.min(ans, total);
        }
        return ans;
    }
}
```
*(needs `import java.util.*;`)*

## Key Takeaways
- The key trick is asymmetric handling: iterate group 1 explicitly (each row must connect to ≥1 column, enforced by construction), but for group 2's leftover columns just add the single cheapest incoming edge — no combinatorial handling needed there since "connected to something" is all that's required for group 2.
- `dp[i][mask]` doubles as both "row `i` still adding edges" (self-loop transition) and "advance to row `i+1`" (forward transition) — this is what lets one row emit multiple edges.
- Precomputing `minCostCol[j]` up front turns an otherwise-recursive "who covers leftover group-2 point" decision into an O(1) lookup at the end.
