# Best Time to Buy and Sell Stock with Cooldown

**Difficulty:** Medium · **Pattern:** state-machine DP with hold / sold / rest states · [LeetCode](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/)

## Problem
Given daily stock `prices`, find the maximum profit with unlimited transactions, where after selling you must wait one full day (cooldown) before buying again. You may hold at most one share at a time.

## Examples
**Example 1**
```
Input:  prices = [1,2,3,0,2]
Output: 3
Explanation: Transactions = [buy, sell, cooldown, buy, sell]
             Buy day0(1) -> Sell day1(2): profit 1. Cooldown day2.
             Buy day3(0) -> Sell day4(2): profit 2. Total = 1+2 = 3.
```
**Example 2**
```
Input:  prices = [1]
Output: 0
Explanation: No transaction possible with a single price point.
```

## Constraints
- `1 <= prices.length <= 5000`
- `0 <= prices[i] <= 1000`

## Approach 1 — Three-state DP arrays
**Idea.** Define three states per day `i`:
- `hold[i]` = max profit while holding a share at end of day `i`.
- `sold[i]` = max profit having just sold on day `i` (share released today, cooldown starts tomorrow).
- `rest[i]` = max profit while not holding and not in the just-sold state (free to buy tomorrow).

Recurrences:
- `hold[i] = max(hold[i-1], rest[i-1] - price[i])` — keep holding, or buy today from a rested state.
- `sold[i] = hold[i-1] + price[i]` — sell the share we were holding.
- `rest[i] = max(rest[i-1], sold[i-1])` — stay resting, or transition out of yesterday's cooldown.

Answer = `max(sold[n-1], rest[n-1])` (ending while holding is never optimal).

**Complexity.** Time O(n), Space O(n) (can be reduced to O(1)).
```java
class Solution {
    public int maxProfit(int[] prices) {
        int n = prices.length;
        if (n <= 1) return 0;

        int[] hold = new int[n];
        int[] sold = new int[n];
        int[] rest = new int[n];

        hold[0] = -prices[0];
        sold[0] = 0;
        rest[0] = 0;

        for (int i = 1; i < n; i++) {
            hold[i] = Math.max(hold[i - 1], rest[i - 1] - prices[i]);
            sold[i] = hold[i - 1] + prices[i];
            rest[i] = Math.max(rest[i - 1], sold[i - 1]);
        }

        return Math.max(sold[n - 1], rest[n - 1]);
    }
}
```

## Approach 2 — Rolling scalars (optimal)
**Idea.** Same three-state recurrence, but since day `i` only depends on day `i-1`, keep three scalars (`hold`, `sold`, `rest`) and update them each iteration using the *previous* iteration's values (captured before overwriting).

**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int maxProfit(int[] prices) {
        int n = prices.length;
        if (n <= 1) return 0;

        int hold = -prices[0];
        int sold = 0;
        int rest = 0;

        for (int i = 1; i < n; i++) {
            int prevHold = hold, prevSold = sold, prevRest = rest;
            hold = Math.max(prevHold, prevRest - prices[i]);
            sold = prevHold + prices[i];
            rest = Math.max(prevRest, prevSold);
        }

        return Math.max(sold, rest);
    }
}
```

## Key Takeaways
- The cooldown constraint is naturally encoded by splitting the "not holding" state into `sold` (just sold, still cooling down) and `rest` (free to buy) — `rest` can only draw from yesterday's `sold` or `rest`, never directly buy same-day after selling.
- Always snapshot previous-iteration scalars before overwriting when rolling a multi-state DP down to O(1) space — updating in place with cross-references (`hold` depends on `rest`, `rest` depends on `sold`) is a common off-by-one-state bug source.
- Final answer excludes `hold` because ending the timeline still holding a share can never beat selling it (prices are ≥ 0).
