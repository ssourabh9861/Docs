# Coin Change I / II

**Difficulty:** Medium · **Pattern:** Unbounded Knapsack — min coins (I) vs count combinations (II) · [LeetCode](https://leetcode.com/problems/coin-change/)

## Problem
**Coin Change I:** Given coin denominations `coins` (unlimited supply of each) and an amount, return the fewest number of coins needed to make up that amount, or -1 if impossible.
**Coin Change II:** Given the same setup, return the number of distinct combinations (order doesn't matter) that make up the amount.

## Examples
**Example 1 (Coin Change I)**
```
Input:  coins = [1,2,5], amount = 11
Output: 3
Explanation: 11 = 5 + 5 + 1, using 3 coins (minimum possible).
```

**Example 2 (Coin Change II)**
```
Input:  amount = 5, coins = [1,2,5]
Output: 4
Explanation: The combinations are {5}, {1,2,2}, {1,1,1,2}, {1,1,1,1,1} -> 4 ways.
```

## Constraints
- 1 <= coins.length <= 300
- 1 <= coins[i] <= 5000
- All coins values are distinct.
- 0 <= amount <= 5000

## Approach 1 — Coin Change I: Min Coins (Unbounded Knapsack, Minimization)
**Idea.** Let `dp[a]` = minimum number of coins to make amount `a`, with `dp[0] = 0` and `dp[a] = infinity` initially for `a > 0` (unreachable). For each amount `a` from 1 to `amount`, and each coin `c`: if `a >= c`, `dp[a] = min(dp[a], dp[a - c] + 1)`. Because each coin can be reused, the amount loop is the outer loop and coins the inner loop (no backward-iteration restriction needed, since reuse is desired here). Final answer is `dp[amount]` if finite, else -1.

**Complexity.** Time O(amount * coins.length), Space O(amount).
```java
import java.util.*;

class Solution {
    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, Integer.MAX_VALUE);
        dp[0] = 0;

        for (int a = 1; a <= amount; a++) {
            for (int c : coins) {
                if (a >= c && dp[a - c] != Integer.MAX_VALUE) {
                    dp[a] = Math.min(dp[a], dp[a - c] + 1);
                }
            }
        }
        return dp[amount] == Integer.MAX_VALUE ? -1 : dp[amount];
    }
}
```

## Approach 2 — Coin Change II: Count Combinations (Unbounded Knapsack, Counting)
**Idea.** Let `dp[a]` = number of distinct combinations of coins summing to `a`, `dp[0] = 1` (one way to make 0: use no coins). To count **combinations** (not permutations, i.e., order doesn't matter — [1,2] and [2,1] are the same), iterate coins in the **outer** loop and amounts in the **inner** loop, going forward: `dp[a] += dp[a - c]` for each coin `c`, for `a` from `c` to `amount`. Fixing the coin as the outer loop guarantees each combination is only counted once, in a canonical order (coins considered in a fixed sequence), rather than counting every permutation of the same multiset.

**Complexity.** Time O(amount * coins.length), Space O(amount).
```java
class Solution {
    public int change(int amount, int[] coins) {
        int[] dp = new int[amount + 1];
        dp[0] = 1;

        for (int c : coins) {
            for (int a = c; a <= amount; a++) {
                dp[a] += dp[a - c];
            }
        }
        return dp[amount];
    }
}
```

## Key Takeaways
- Both problems use the unbounded knapsack pattern (coins reusable), but loop order matters based on what's being computed: min-coins (I) is agnostic to loop order since it's an optimization, not a counting problem; count-combinations (II) MUST put coins on the outside to avoid counting permutations as distinct.
- Contrast with 0/1 knapsack (Partition Equal Subset Sum): there, iterating capacity backward per item enforces "use at most once"; here, iterating capacity forward allows unlimited reuse of each coin.
- `dp[0] = 0` for minimization (base: 0 coins needed for amount 0) vs `dp[0] = 1` for counting (base: exactly one way — the empty combination — to make amount 0).
