# Last Stone Weight II

**Difficulty:** Hard · **Pattern:** 0/1 Knapsack — minimize |difference| via subset-sum near half-total · [LeetCode](https://leetcode.com/problems/last-stone-weight-ii/)

## Problem
Given an array of stone weights, repeatedly choose any two stones and smash them together: if weights are `x <= y`, the result is `y - x` (if equal, both vanish). Return the smallest possible weight of the last remaining stone (0 if none remain).

## Examples
**Example 1**
```
Input:  stones = [2,7,4,1,8,1]
Output: 1
Explanation: One sequence: smash 2&4 -> 2, smash 7&8 -> 1, smash 2&1 -> 1, smash 1&1 -> 0... 
one optimal partition gives groups summing to 15 and 8 (total 23), leaving |15-8| = 1.
```

**Example 2**
```
Input:  stones = [31,26,33,21,40]
Output: 5
```

## Constraints
- 1 <= stones.length <= 30
- 1 <= stones[i] <= 100

## Approach 1 — Reformulate as Partition Minimizing |Sum Difference|
**Idea.** Regardless of the order stones are smashed, the final leftover weight equals `|sum(A) - sum(B)|` for some partition of stones into groups `A` and `B` (each smash effectively assigns a `+` or `-` sign to a stone, similar to Target Sum). To minimize `|sum(A) - sum(B)|`, we want `sum(A)` as close as possible to `total / 2`. Let `target = total / 2` (integer division). Define `dp[s]` = true if some subset of stones sums to exactly `s`. Compute all achievable sums up to `target` via 0/1 knapsack, then find the largest achievable `s <= target`; the answer is `total - 2*s`.

**Complexity.** Time O(n * total), Space O(total).
```java
class Solution {
    public int lastStoneWeightII(int[] stones) {
        int total = 0;
        for (int s : stones) total += s;

        int target = total / 2;
        boolean[] dp = new boolean[target + 1];
        dp[0] = true;

        for (int stone : stones) {
            for (int s = target; s >= stone; s--) {
                if (dp[s - stone]) {
                    dp[s] = true;
                }
            }
        }

        int closest = 0;
        for (int s = target; s >= 0; s--) {
            if (dp[s]) {
                closest = s;
                break;
            }
        }
        return total - 2 * closest;
    }
}
```

## Approach 2 — 2D Tabulation (Explicit State, for Clarity)
**Idea.** Same idea made explicit with a 2D table before rolling: `dp[i][s]` = true if using stones `0..i-1` some subset sums to `s`. `dp[0][0] = true`. Transition: `dp[i][s] = dp[i-1][s] OR (s >= stones[i-1] && dp[i-1][s - stones[i-1]])`. After filling the table, scan row `n` for the largest reachable `s <= target` and return `total - 2*s`. This mirrors Partition Equal Subset Sum exactly, but instead of checking one exact target we scan for the closest reachable sum.

**Complexity.** Time O(n * total), Space O(n * total).
```java
class Solution {
    public int lastStoneWeightII(int[] stones) {
        int n = stones.length;
        int total = 0;
        for (int s : stones) total += s;
        int target = total / 2;

        boolean[][] dp = new boolean[n + 1][target + 1];
        dp[0][0] = true;

        for (int i = 1; i <= n; i++) {
            int w = stones[i - 1];
            for (int s = 0; s <= target; s++) {
                dp[i][s] = dp[i - 1][s];
                if (s >= w && dp[i - 1][s - w]) {
                    dp[i][s] = true;
                }
            }
        }

        int closest = 0;
        for (int s = target; s >= 0; s--) {
            if (dp[n][s]) {
                closest = s;
                break;
            }
        }
        return total - 2 * closest;
    }
}
```

## Key Takeaways
- Smashing stones is really "partition into two groups, minimize the absolute difference of their sums" — the smashing order doesn't affect the achievable final results.
- This is Partition Equal Subset Sum generalized: instead of checking whether exactly `total/2` is reachable, find the largest reachable sum `<= total/2`.
- The final formula `total - 2*closest` converts "best achievable half" back into the minimum possible difference.
