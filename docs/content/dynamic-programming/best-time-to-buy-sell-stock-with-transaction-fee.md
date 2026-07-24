# Best Time to Buy and Sell Stock with Transaction Fee

**Difficulty:** Medium · **Pattern:** 2-state DP (hold / cash) with a flat fee per transaction · [LeetCode](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-transaction-fee/)

## Problem
Given daily stock `prices` and an integer `fee`, find the maximum profit with unlimited transactions, where each completed transaction (one buy + one sell) incurs a flat `fee`. You may hold at most one share at a time.

## Examples
**Example 1**
```
Input:  prices = [1,3,2,8,4,9], fee = 2
Output: 8
Explanation: Buy day0(1), sell day3(8): profit 8-1-2=5. Buy day4(4), sell day5(9): profit 9-4-2=3.
             Total = 5+3 = 8.
```
**Example 2**
```
Input:  prices = [1,3,7,5,10,3], fee = 3
Output: 6
Explanation: Buy day0(1), sell day4(10): profit 10-1-3=6. A single transaction beats splitting it here.
```

## Constraints
- `1 <= prices.length <= 5 * 10^4`
- `1 <= prices[i] < 5 * 10^4`
- `0 <= fee < 5 * 10^4`

## Approach 1 — Two-state DP arrays (cash / hold)
**Idea.** Define, for each day `i`:
- `cash[i]` = max profit at end of day `i` while **not** holding a share.
- `hold[i]` = max profit at end of day `i` while holding a share.

Charge the fee at sell time (equivalently could charge at buy time — same total). Recurrences:
- `cash[i] = max(cash[i-1], hold[i-1] + price[i] - fee)` — stay out, or sell today.
- `hold[i] = max(hold[i-1], cash[i-1] - price[i])` — keep holding, or buy today.

Base: `cash[0] = 0`, `hold[0] = -prices[0]`. Answer = `cash[n-1]` (ending while holding can't be optimal since we'd still owe money for that unsold share).

**Complexity.** Time O(n), Space O(n) (reducible to O(1)).
```java
class Solution {
    public int maxProfit(int[] prices, int fee) {
        int n = prices.length;
        if (n <= 1) return 0;

        int[] cash = new int[n];
        int[] hold = new int[n];
        cash[0] = 0;
        hold[0] = -prices[0];

        for (int i = 1; i < n; i++) {
            cash[i] = Math.max(cash[i - 1], hold[i - 1] + prices[i] - fee);
            hold[i] = Math.max(hold[i - 1], cash[i - 1] - prices[i]);
        }

        return cash[n - 1];
    }
}
```

## Approach 2 — Rolling scalars (optimal)
**Idea.** Same recurrence, collapsed to two scalars since day `i` depends only on day `i-1`. This is the standard production form of this DP.

**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int maxProfit(int[] prices, int fee) {
        int n = prices.length;
        if (n <= 1) return 0;

        int cash = 0;
        int hold = -prices[0];

        for (int i = 1; i < n; i++) {
            int prevCash = cash;
            cash = Math.max(cash, hold + prices[i] - fee);
            hold = Math.max(hold, prevCash - prices[i]);
        }

        return cash;
    }
}
```

## Key Takeaways
- Only two states are needed (`cash`, `hold`) — unlike cooldown, there's no third "resting" state because you can immediately re-buy the same day you sell (no cooldown here).
- Charging the fee once per completed transaction (at the sell transition) is equivalent to charging it at buy time — pick one consistently, don't double-charge.
- This is the simplest of the four stock-DP variants in this batch; III/IV add more transaction slots, cooldown adds a rest state, this one just adds a subtracted constant on sell.
