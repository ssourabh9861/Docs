# Number of Dice Rolls With Target Sum

**Difficulty:** Medium · **Pattern:** Bounded Knapsack — count ways with per-die choice of 1..k · [LeetCode](https://leetcode.com/problems/number-of-dice-rolls-with-target-sum/)

## Problem
Given `n` dice each with `k` faces (numbered 1 to `k`), count the number of ways to roll the dice so the sum of face values equals `target`. Return the answer modulo 10^9 + 7.

## Examples
**Example 1**
```
Input:  n = 1, k = 6, target = 3
Output: 1
Explanation: Only one die, showing 3, gives sum 3.
```

**Example 2**
```
Input:  n = 2, k = 6, target = 7
Output: 6
Explanation: (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) all sum to 7.
```

## Constraints
- 1 <= n, k <= 30
- 1 <= target <= 1000

## Approach 1 — Top-Down Memoization
**Idea.** Define `f(diceLeft, remaining)` = number of ways to reach exactly `remaining` using `diceLeft` more dice. Base case: `f(0, 0) = 1` (no dice left, exactly hit the target), `f(0, remaining) = 0` for `remaining != 0`. Recurrence: try every face value `face` from 1 to `k` for the current die:
`f(diceLeft, remaining) = sum over face in [1, k] of f(diceLeft - 1, remaining - face)` (only valid faces where `remaining - face >= 0`).
Answer is `f(n, target)`.

**Complexity.** Time O(n * target * k), Space O(n * target) for memo.
```java
class Solution {
    private static final int MOD = 1_000_000_007;
    private Integer[][] memo;
    private int k;

    public int numRollsToTarget(int n, int k, int target) {
        this.k = k;
        this.memo = new Integer[n + 1][target + 1];
        return f(n, target);
    }

    private int f(int diceLeft, int remaining) {
        if (diceLeft == 0) {
            return remaining == 0 ? 1 : 0;
        }
        if (remaining < 0) return 0;
        if (memo[diceLeft][remaining] != null) return memo[diceLeft][remaining];

        long ways = 0;
        for (int face = 1; face <= k && face <= remaining; face++) {
            ways = (ways + f(diceLeft - 1, remaining - face)) % MOD;
        }
        return memo[diceLeft][remaining] = (int) ways;
    }
}
```

## Approach 2 — Bottom-Up Tabulation (Space-Optimized Rolling Rows)
**Idea.** Let `dp[d][t]` = number of ways to get sum `t` using exactly `d` dice. `dp[0][0] = 1`, all other `dp[0][t>0] = 0`. For each die `d` from 1 to `n`, and each achievable target `t` from 1 to `target`: sum over face values `f` from 1 to `min(k, t)`: `dp[d][t] += dp[d-1][t-f]`. Since row `d` only depends on row `d-1`, roll into two 1D arrays (`prev`/`cur`) to cut space to O(target).

**Complexity.** Time O(n * target * k), Space O(target).
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int numRollsToTarget(int n, int k, int target) {
        int[] prev = new int[target + 1];
        prev[0] = 1; // 0 dice, sum 0: exactly one way

        for (int d = 1; d <= n; d++) {
            int[] cur = new int[target + 1];
            for (int t = 1; t <= target; t++) {
                long ways = 0;
                for (int face = 1; face <= k && face <= t; face++) {
                    ways += prev[t - face];
                }
                cur[t] = (int) (ways % MOD);
            }
            prev = cur;
        }
        return prev[target];
    }
}
```

## Key Takeaways
- This is a bounded-choice knapsack: each "item" (die) contributes exactly one of `k` discrete values rather than 0-or-1 or unlimited reuse — so the inner loop enumerates all face values for each state.
- The recurrence structure — "sum over all choices for the current step of dp[stepsLeft-1][remaining - choice]" — generalizes to any fixed-choice-set counting DP.
- Rolling two 1D arrays (previous die's row, current die's row) keeps space linear in target instead of O(n * target); a sliding-window sum trick can further reduce the inner loop to O(1) amortized if needed.
