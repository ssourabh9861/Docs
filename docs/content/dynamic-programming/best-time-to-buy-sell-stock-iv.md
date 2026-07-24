# Best Time to Buy and Sell Stock IV

**Difficulty:** Hard · **Pattern:** state-machine DP generalized over k transaction slots · [LeetCode](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iv/)

## Problem
Given an integer `k` and an array `prices`, find the maximum profit with **at most `k`** buy-sell transactions (no overlapping holdings — must sell before buying again).

## Examples
**Example 1**
```
Input:  k = 2, prices = [2,4,1]
Output: 2
Explanation: Buy on day 1 (price=2), sell on day 2 (price=4), profit = 2.
```
**Example 2**
```
Input:  k = 2, prices = [3,2,6,5,0,3]
Output: 7
Explanation: Buy on day 2 (price=2), sell on day 3 (price=6), profit = 4.
             Then buy on day 5 (price=0), sell on day 6 (price=3), profit = 3.
             Total = 4 + 3 = 7.
```

## Constraints
- `1 <= k <= 100`
- `1 <= prices.length <= 1000`
- `0 <= prices[i] <= 1000`

## Approach 1 — DP over (day, transactions used, holding state)
**Idea.** Let `dp[t][h]` = max profit using at most `t` completed transactions, where `h ∈ {0, 1}` denotes not holding / holding a share, as we scan days left to right. Transition per day for `t = 1..k`:
- `hold[t] = max(hold[t], sold[t-1] - price)` — buy today, starting the t-th transaction (funded by profit from `t-1` completed sells).
- `sold[t] = max(sold[t], hold[t] + price)` — sell today, completing the t-th transaction.

Base case: `sold[0] = 0` for all days (0 transactions ⇒ 0 profit), `hold[t]` initialized to `-infinity` (not yet possible) before any buy. Answer is `sold[k]`.

**Complexity.** Time O(n·k), Space O(k).
```java
class Solution {
    public int maxProfit(int k, int[] prices) {
        int n = prices.length;
        if (n == 0 || k == 0) return 0;

        int[] hold = new int[k + 1];
        int[] sold = new int[k + 1];
        Arrays.fill(hold, Integer.MIN_VALUE / 2);

        for (int price : prices) {
            for (int t = 1; t <= k; t++) {
                hold[t] = Math.max(hold[t], sold[t - 1] - price);
                sold[t] = Math.max(sold[t], hold[t] + price);
            }
        }
        return sold[k];
    }
}
```
*(needs `import java.util.Arrays;`)*

## Approach 2 — Unlimited-transaction shortcut when k ≥ n/2 (optimal)
**Idea.** A transaction needs at least 2 distinct days (buy day, sell day), so with `n` days you can never complete more than `n/2` meaningful transactions. When `k >= n/2`, the "at most k" constraint is not binding — the problem degenerates to the *unlimited transactions* variant (Stock II), solvable greedily/DP in O(n) by summing every positive day-to-day price delta: `profit += max(0, prices[i] - prices[i-1])`. Combine this with Approach 1 for the general case to avoid an O(n·k) blowup when `k` is large relative to `n`.

**Complexity.** Time O(n) when `k >= n/2`, else O(n·k). Space O(1) / O(k) respectively.
```java
class Solution {
    public int maxProfit(int k, int[] prices) {
        int n = prices.length;
        if (n == 0 || k == 0) return 0;

        if (k >= n / 2) {
            int profit = 0;
            for (int i = 1; i < n; i++) {
                if (prices[i] > prices[i - 1]) {
                    profit += prices[i] - prices[i - 1];
                }
            }
            return profit;
        }

        int[] hold = new int[k + 1];
        int[] sold = new int[k + 1];
        java.util.Arrays.fill(hold, Integer.MIN_VALUE / 2);

        for (int price : prices) {
            for (int t = 1; t <= k; t++) {
                hold[t] = Math.max(hold[t], sold[t - 1] - price);
                sold[t] = Math.max(sold[t], hold[t] + price);
            }
        }
        return sold[k];
    }
}
```

## Key Takeaways
- Generalizes Stock III's 4-state DP to `2k` states (`hold[1..k]`, `sold[1..k]`), updated in increasing `t` order per day so `sold[t-1]` reflects the current day already.
- The `k >= n/2` guard is essential for correctness *and* performance — without it, huge `k` (e.g. `k = 10^9` in looser variants, or just `k = 100` with small `n`) wastes time on an unreachable transaction count.
- `Integer.MIN_VALUE / 2` (not raw `MIN_VALUE`) avoids overflow when adding `price` to an uninitialized `hold` state.
