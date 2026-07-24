# Stone Game VII

**Difficulty:** Hard · **Pattern:** Interval DP on score difference with prefix sums · [LeetCode](https://leetcode.com/problems/stone-game-vii/)

## Problem
Alice and Bob alternately remove a stone from either end of an array `stones` (Alice first). Removing a stone scores the *remaining* sum of the array. Both play optimally to maximize their own score. Return the difference `Alice's score - Bob's score`.

## Examples
**Example 1**
```
Input:  stones = [5,3,1,4,2]
Output: 6
Explanation: Optimal play gives Alice 18 and Bob 12, a difference of 6.
```
**Example 2**
```
Input:  stones = [7,90,5,1,100,10,10,2]
Output: 122
```

## Constraints
- `2 <= stones.length <= 1000`
- `1 <= stones[i] <= 1000`

## Approach 1 — Interval DP on the score-difference game value
**Idea.** Define `dp[i][j]` as the best possible score difference (current mover minus opponent) achievable on the sub-range `stones[i..j]`. The mover chooses to remove either end: removing `stones[i]` scores `sum(i+1, j)` and leaves the opponent facing `[i+1, j]`, contributing `sum(i+1,j) - dp[i+1][j]` to the difference; removing `stones[j]` similarly contributes `sum(i,j-1) - dp[i][j-1]`. The mover picks whichever is larger: `dp[i][j] = max(sum(i+1,j) - dp[i+1][j], sum(i,j-1) - dp[i][j-1])`. Base case `dp[i][i] = 0` (no stones left to score by removing the last one). Precompute prefix sums for O(1) range sums.
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    public int stoneGameVII(int[] stones) {
        int n = stones.length;
        int[] prefix = new int[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + stones[i];

        int[][] dp = new int[n][n];
        for (int len = 2; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                int sumWithoutLeft = prefix[j + 1] - prefix[i + 1];
                int sumWithoutRight = prefix[j] - prefix[i];
                dp[i][j] = Math.max(
                    sumWithoutLeft - dp[i + 1][j],
                    sumWithoutRight - dp[i][j - 1]
                );
            }
        }
        return dp[0][n - 1];
    }
}
```

## Approach 2 — Space-optimized rolling interval DP (optimal)
**Idea.** The recurrence only ever references `dp[i+1][j]` and `dp[i][j-1]` — both from the previous length layer. Iterating by increasing length and reusing a single 2D array in place (filling `dp[i][j]` after its dependencies from a shorter length are set) keeps the same asymptotics but is the natural bottom-up form; no separate rolling array is actually needed beyond ordering by length, so this reduces to tightening Approach 1's loop and is already optimal for this problem size. The real gain available is precomputing prefix sums once (already done) instead of recomputing range sums per state, which is what keeps this at O(n²) instead of O(n³).
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    public int stoneGameVII(int[] stones) {
        int n = stones.length;
        int[] prefix = new int[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + stones[i];

        int[][] dp = new int[n][n];
        for (int len = 2; len <= n; len++) {
            for (int i = 0, j = len - 1; j < n; i++, j++) {
                int sumWithoutLeft = prefix[j + 1] - prefix[i + 1];
                int sumWithoutRight = prefix[j] - prefix[i];
                dp[i][j] = Math.max(sumWithoutLeft - dp[i + 1][j], sumWithoutRight - dp[i][j - 1]);
            }
        }
        return dp[0][n - 1];
    }
}
```

## Key Takeaways
- Modeling the state as a *score difference* (not each player's score separately) is the key simplification for this class of alternating-turn games — it collapses two unknowns into one.
- Prefix sums are essential here: without them, computing `sum(i,j)` per state costs O(n), pushing total time to O(n³).
- The same "difference DP" trick applies to Predict the Winner, Stone Game (I/II), and other optimal-alternating-play problems.
