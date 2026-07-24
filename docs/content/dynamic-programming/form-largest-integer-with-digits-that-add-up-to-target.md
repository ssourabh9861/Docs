# Form Largest Integer With Digits That Add up to Target

**Difficulty:** Hard · **Pattern:** Unbounded Knapsack — maximize digit count first, then build lexicographically largest number · [LeetCode](https://leetcode.com/problems/form-largest-integer-with-digits-that-add-up-to-target/)

## Problem
Given `cost[]` where `cost[i]` is the cost of using digit `i+1` (1-indexed, digits 1-9), and a total budget `target`, form the **largest possible integer** (as a string) whose digit costs sum to exactly `target`. Each digit can be used any number of times. Return "0" if no valid integer can be formed.

## Examples
**Example 1**
```
Input:  cost = [4,3,2,5,6,7,2,5,5], target = 9
Output: "7772"
Explanation: Digit 7 costs 2, digit 2 costs 2. Using four digits of cost 2 total each (7,7,7,2) sums to 9,
using 4 digits — more digits than any other combo, and among max-length options this is the lexicographically largest arrangement.
```

**Example 2**
```
Input:  cost = [7,6,5,5,5,6,8,7,8], target = 12
Output: "85"
```

## Constraints
- cost.length == 9
- 1 <= cost[i] <= 5000
- 1 <= target <= 5000

## Approach 1 — Two-Phase DP: Max Digit Count, then Greedy Reconstruction
**Idea. Phase 1 (unbounded knapsack, maximize count).** Since more digits always beats fewer digits (any leading digit >= 1 makes a longer number larger, e.g., "99" > "9"), first find the **maximum number of digits** achievable with total cost exactly `target`. Define `dp[t]` = maximum digit count achievable using exactly cost `t` (or `-infinity` / unreachable if impossible). `dp[0] = 0`. For each `t` from 1 to `target`, for each digit `d` from 1 to 9 with `cost[d-1] <= t`: `dp[t] = max(dp[t], dp[t - cost[d-1]] + 1)` (unbounded reuse, so iterate `t` forward). If `dp[target] <= 0` (or unreachable), return "0".
**Phase 2 (greedy reconstruction).** Having fixed the digit count `dp[target]`, reconstruct the actual largest string: to make the number lexicographically largest, greedily pick the **largest digit** (9 down to 1) at each position, provided using it still allows the remaining budget to be filled with the remaining digit count exactly (i.e., `dp[remaining - cost[d-1]] == dp[remaining] - 1`). Repeat until budget hits 0.

**Complexity.** Time O(target * 9) for phase 1, O(target * 9) for phase 2. Total O(target). Space O(target).
```java
class Solution {
    public String largestNumber(int[] cost, int target) {
        int[] dp = new int[target + 1];
        java.util.Arrays.fill(dp, Integer.MIN_VALUE);
        dp[0] = 0;

        // Phase 1: max number of digits achievable for each exact cost t
        for (int t = 1; t <= target; t++) {
            for (int d = 1; d <= 9; d++) {
                int c = cost[d - 1];
                if (t >= c && dp[t - c] != Integer.MIN_VALUE) {
                    dp[t] = Math.max(dp[t], dp[t - c] + 1);
                }
            }
        }

        if (dp[target] <= 0) return "0";

        // Phase 2: greedily reconstruct the largest number digit by digit
        StringBuilder sb = new StringBuilder();
        int remaining = target;
        while (remaining > 0) {
            for (int d = 9; d >= 1; d--) {
                int c = cost[d - 1];
                if (remaining >= c && dp[remaining - c] == dp[remaining] - 1) {
                    sb.append((char) ('0' + d));
                    remaining -= c;
                    break;
                }
            }
        }
        return sb.toString();
    }
}
```

## Approach 2 — Single-Pass Greedy with Precomputed Max-Count Table (Same DP, Cleaner Reconstruction Loop)
**Idea.** Functionally identical to Approach 1, but restructured to make the greedy step explicit as its own loop with an early exit and clearer state tracking — useful for reasoning about correctness step by step. Build the same `dp[]` max-count table via unbounded knapsack. Then reconstruct by maintaining `remaining` budget and, at each of the `dp[target]` positions, scanning digits from 9 down to 1 and taking the first digit that keeps the rest of the budget exactly fillable with one fewer digit. This greedy is correct because digit value dominates position value (choosing a larger digit now is never wrong as long as feasibility for the remaining positions is preserved).

**Complexity.** Time O(target * 9), Space O(target).
```java
class Solution {
    public String largestNumber(int[] cost, int target) {
        int[] maxCount = buildMaxCountTable(cost, target);
        if (maxCount[target] <= 0) return "0";

        StringBuilder result = new StringBuilder();
        int remaining = target;
        int digitsLeft = maxCount[target];

        while (digitsLeft > 0) {
            for (int d = 9; d >= 1; d--) {
                int c = cost[d - 1];
                if (remaining - c >= 0 && maxCount[remaining - c] == digitsLeft - 1) {
                    result.append(d);
                    remaining -= c;
                    digitsLeft--;
                    break;
                }
            }
        }
        return result.toString();
    }

    private int[] buildMaxCountTable(int[] cost, int target) {
        int[] dp = new int[target + 1];
        java.util.Arrays.fill(dp, Integer.MIN_VALUE);
        dp[0] = 0;
        for (int t = 1; t <= target; t++) {
            for (int d = 1; d <= 9; d++) {
                int c = cost[d - 1];
                if (t >= c && dp[t - c] != Integer.MIN_VALUE) {
                    dp[t] = Math.max(dp[t], dp[t - c] + 1);
                }
            }
        }
        return dp;
    }
}
```

## Key Takeaways
- Split the problem: first maximize digit **count** (unbounded knapsack, since more digits beats any digit-value advantage), then greedily maximize digit **value** at each position among choices that preserve feasibility.
- The greedy reconstruction step is only valid because we already know the exact achievable max count at every remaining budget (`dp[]` table) — without that table, greedily picking the largest digit first could dead-end.
- This pattern — "unbounded knapsack for a count/value ceiling, then greedy reconstruction using the DP table as a feasibility oracle" — generalizes to other "build the largest/smallest structure under a budget" problems.
