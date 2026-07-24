# Cherry Pickup

**Difficulty:** Hard · **Pattern:** Two synchronized paths in one grid — DP over `(r1, c1, r2)` since both paths take the same number of steps · [LeetCode](https://leetcode.com/problems/cherry-pickup/)

## Problem
An `n x n` grid has cells with `1` (cherry), `0` (empty), or `-1` (blocked). Starting at top-left, go to bottom-right moving only right/down, then return to top-left moving only left/up, picking cherries along the way (a cell's cherry can only be collected once). Maximize total cherries picked, or return 0 if no valid round trip exists.

## Examples
**Example 1**
```
Input:  grid = [[0,1,-1],[1,0,-1],[1,1,1]]
Output: 5
Explanation: The forward and back trip together collect all 5 reachable
cherries without crossing a blocked cell.
```

## Constraints
- `n == grid.length == grid[i].length`
- `1 <= n <= 50`
- `grid[i][j]` is `-1`, `0`, or `1`

## Approach 1 — Top-down memoization on (r1, c1, r2)
**Idea.** A round trip top-left→bottom-right→top-left is equivalent to two *simultaneous* forward trips top-left→bottom-right (by reversing the return leg). If both travelers take exactly `t = r + c` steps, then knowing `r1, c1, r2` determines `c2 = r1 + c1 - r2`. Define `dp(r1, c1, r2) =` max cherries collectible by both travelers from `(r1,c1)` and `(r2,c2)` to `(n-1,n-1)`. At each state, each traveler independently moves right or down (4 combinations); add `grid[r1][c1]` once, plus `grid[r2][c2]` only if `(r2,c2) != (r1,c1)` to avoid double counting a shared cell. Any blocked cell makes that branch invalid (`-∞`).
**Complexity.** Time O(n³) states × O(4) transitions = O(n³), Space O(n³) memo.
```java
class Solution {
    private int[][][] memo;
    private int[][] grid;
    private int n;

    public int cherryPickup(int[][] grid) {
        this.grid = grid;
        this.n = grid.length;
        memo = new int[n][n][n];
        for (int[][] plane : memo) for (int[] row : plane) Arrays.fill(row, Integer.MIN_VALUE);
        int result = dp(0, 0, 0);
        return Math.max(result, 0);
    }

    private int dp(int r1, int c1, int r2) {
        int c2 = r1 + c1 - r2;
        if (r1 >= n || c1 >= n || r2 >= n || c2 >= n
                || grid[r1][c1] == -1 || grid[r2][c2] == -1) {
            return Integer.MIN_VALUE;
        }
        if (r1 == n - 1 && c1 == n - 1) {
            return grid[r1][c1];
        }
        if (memo[r1][c1][r2] != Integer.MIN_VALUE) {
            return memo[r1][c1][r2];
        }
        int cherries = grid[r1][c1];
        if (r1 != r2) cherries += grid[r2][c2];

        int best = Math.max(
                Math.max(dp(r1 + 1, c1, r2 + 1), dp(r1 + 1, c1, r2)),
                Math.max(dp(r1, c1 + 1, r2 + 1), dp(r1, c1 + 1, r2)));

        int result = (best == Integer.MIN_VALUE) ? Integer.MIN_VALUE : best + cherries;
        memo[r1][c1][r2] = result;
        return result;
    }
}
```

## Approach 2 — Bottom-up 3D DP by step
**Idea.** Iterate `step` from `0` to `2n-2` (total moves made so far). For each `step`, both travelers' `(r,c)` satisfy `r + c = step`, so state is `dp[r1][r2]` at that step, derived from the 4 combinations of predecessors at `step - 1`.
**Complexity.** Time O(n³), Space O(n²) (rolling over step).
```java
class Solution {
    public int cherryPickup(int[][] grid) {
        int n = grid.length;
        int[][] dp = new int[n][n];
        for (int[] row : dp) Arrays.fill(row, Integer.MIN_VALUE);
        dp[0][0] = grid[0][0];

        for (int step = 1; step <= 2 * (n - 1); step++) {
            int[][] next = new int[n][n];
            for (int[] row : next) Arrays.fill(row, Integer.MIN_VALUE);
            for (int r1 = Math.max(0, step - (n - 1)); r1 <= Math.min(n - 1, step); r1++) {
                int c1 = step - r1;
                if (c1 < 0 || c1 >= n || grid[r1][c1] == -1) continue;
                for (int r2 = r1; r2 <= Math.min(n - 1, step); r2++) {
                    int c2 = step - r2;
                    if (c2 < 0 || c2 >= n || grid[r2][c2] == -1) continue;
                    int best = Integer.MIN_VALUE;
                    for (int pr1 : new int[]{r1 - 1, r1}) {
                        for (int pr2 : new int[]{r2 - 1, r2}) {
                            if (pr1 >= 0 && pr2 >= 0 && dp[pr1][pr2] != Integer.MIN_VALUE) {
                                best = Math.max(best, dp[pr1][pr2]);
                            }
                        }
                    }
                    if (best == Integer.MIN_VALUE) continue;
                    int gain = grid[r1][c1] + (r1 != r2 ? grid[r2][c2] : 0);
                    next[r1][r2] = best + gain;
                }
            }
            dp = next;
        }
        int result = dp[n - 1][n - 1];
        return Math.max(result, 0);
    }
}
```

## Key Takeaways
- The "go and return" trip is a disguised "two people go forward simultaneously" problem — a very common trick for path problems with a round trip.
- Deduplicate the shared-cell cherry exactly when both travelers occupy the same cell (`r1 == r2` implies `c1 == c2` since both are on step `t`).
- Clamp the final answer to `0` since a fully blocked grid should report "no cherries," not a negative sentinel.
