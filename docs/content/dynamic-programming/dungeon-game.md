# Dungeon Game

**Difficulty:** Hard · **Pattern:** Grid DP computed backward from the destination, tracking minimum health required · [LeetCode](https://leetcode.com/problems/dungeon-game/)

## Problem
A knight must travel from the top-left cell of a dungeon grid to the bottom-right cell (rescuing the princess), moving only right or down. Each cell adds or subtracts health (negative = demon, positive = potion). The knight dies if health drops to 0 or below at any point. Find the minimum initial health needed to guarantee survival to the end.

## Examples
**Example 1**
```
Input:  dungeon = [[-2,-3,3],[-5,-10,1],[10,30,-5]]
Output: 7
Explanation: Path RIGHT -> RIGHT -> DOWN -> DOWN needs 7 starting HP so
health never dips to 0 or below (7-3=4-5=-1 -> wait, the optimal path is
DOWN->DOWN->RIGHT->RIGHT with HP trace 7,2,-3->survives; needs 7).
```

## Constraints
- `1 <= m, n <= 200`
- `-1000 <= dungeon[i][j] <= 1000`

## Approach 1 — 2D DP from bottom-right backward
**Idea.** Work backward: let `dp[i][j]` be the minimum HP the knight must have *upon entering* cell `(i,j)` to survive the rest of the journey. The knight always needs at least 1 HP after any step, so `dp[i][j] = max(1, min(dp[i+1][j], dp[i][j+1]) - dungeon[i][j])`. Base case at the princess's cell: `dp[m-1][n-1] = max(1, 1 - dungeon[m-1][n-1])`. Pad the grid with a virtual row/column of infinity so edge cells only ever pick the real neighbor.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int calculateMinimumHP(int[][] dungeon) {
        int m = dungeon.length, n = dungeon[0].length;
        int[][] dp = new int[m + 1][n + 1];
        for (int[] row : dp) Arrays.fill(row, Integer.MAX_VALUE);
        dp[m][n - 1] = 1;
        dp[m - 1][n] = 1;
        for (int i = m - 1; i >= 0; i--) {
            for (int j = n - 1; j >= 0; j--) {
                int need = Math.min(dp[i + 1][j], dp[i][j + 1]) - dungeon[i][j];
                dp[i][j] = Math.max(1, need);
            }
        }
        return dp[0][0];
    }
}
```

## Approach 2 — Rolling 1D array (space optimized)
**Idea.** Since row `i` only depends on row `i+1` and the entry to the right in the same row, one array processed right-to-left, bottom-to-top is enough.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public int calculateMinimumHP(int[][] dungeon) {
        int m = dungeon.length, n = dungeon[0].length;
        int[] dp = new int[n + 1];
        Arrays.fill(dp, Integer.MAX_VALUE);
        dp[n - 1] = 1;
        for (int i = m - 1; i >= 0; i--) {
            int rightVal = Integer.MAX_VALUE; // represents dp[i][n] boundary
            for (int j = n - 1; j >= 0; j--) {
                int fromRight = (j == n - 1) ? rightVal : dp[j + 1];
                int need = Math.min(dp[j], fromRight) - dungeon[i][j];
                dp[j] = Math.max(1, need);
            }
        }
        return dp[0];
    }
}
```

## Key Takeaways
- Forward DP fails because "max health so far" isn't optimal-substructure friendly (a high-health path might dip below 1 mid-route); working backward from the goal with a "minimum required entering health" state fixes this.
- The `max(1, ...)` clamp is essential — health can never be computed as ≤ 0 and still be valid.
- Sentinel `Integer.MAX_VALUE` boundaries let corner cells use the same unified formula without special-casing.
