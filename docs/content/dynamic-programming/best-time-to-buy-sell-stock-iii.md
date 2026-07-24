# Best Time to Buy and Sell Stock III

**Difficulty:** Hard · **Pattern:** state-machine DP over transaction slots (buy1/sell1/buy2/sell2) · [LeetCode](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iii/)

## Problem
Given an array `prices` where `prices[i]` is the stock price on day `i`, find the maximum profit achievable with **at most two** buy-sell transactions. You must sell before buying again (cannot hold more than one share at a time).

## Examples
**Example 1**
```
Input:  prices = [3,3,5,0,0,3,1,4]
Output: 6
Explanation: Buy on day 4 (price=0), sell on day 6 (price=3), profit = 3.
             Then buy on day 7 (price=1), sell on day 8 (price=4), profit = 3.
             Total profit = 3 + 3 = 6.
```
**Example 2**
```
Input:  prices = [1,2,3,4,5]
Output: 4
Explanation: Buy on day 1, sell on day 5, profit = 4. Only one transaction is needed
             (a second transaction would just add zero profit), so at-most-2 still gives 4.
```

## Constraints
- `1 <= prices.length <= 10^5`
- `0 <= prices[i] <= 10^5`

## Approach 1 — Two independent DP tables (4 arrays)
**Idea.** Track four running states as we scan left to right:
`buy1[i]` = best (most negative-cost, i.e. max of `-price`) balance after first buy by day `i`;
`sell1[i]` = best profit after first sell by day `i`;
`buy2[i]` = best balance after second buy (funded by `sell1` profit) by day `i`;
`sell2[i]` = best profit after second sell by day `i`.

Recurrences (all as running maxima over the scan):
- `buy1  = max(buy1,  -price)`
- `sell1 = max(sell1, buy1 + price)`
- `buy2  = max(buy2,  sell1 - price)`
- `sell2 = max(sell2, buy2 + price)`

The answer is `sell2` at the end. This is a 1D rolling version of a 4-state DP, so no explicit arrays are even needed, but writing it as four scalar "arrays of size 1" makes the state transition explicit.

**Complexity.** Time O(n), Space O(1) (four scalars).
```java
class Solution {
    public int maxProfit(int[] prices) {
        if (prices.length == 0) return 0;
        int buy1 = Integer.MIN_VALUE, sell1 = 0;
        int buy2 = Integer.MIN_VALUE, sell2 = 0;

        for (int price : prices) {
            buy1  = Math.max(buy1,  -price);
            sell1 = Math.max(sell1, buy1 + price);
            buy2  = Math.max(buy2,  sell1 - price);
            sell2 = Math.max(sell2, buy2 + price);
        }
        return sell2;
    }
}
```

## Approach 2 — Generalized k-transaction DP (optimal, reduces to Stock IV with k=2)
**Idea.** Define `buy[t]` = max profit while holding a share on the `t`-th buy, `sell[t]` = max profit after completing the `t`-th sell, for `t = 1..k` (here `k = 2`). Process prices once; for each day update `buy[t] = max(buy[t], sell[t-1] - price)` and `sell[t] = max(sell[t], buy[t] + price)`, iterating `t` from 1 to k in increasing order so `sell[t-1]` is already updated for the current day. This is exactly the specialization of the Stock IV solution to `k = 2`, and demonstrates why the two problems share one template.

**Complexity.** Time O(n·k) = O(2n) = O(n), Space O(k) = O(1).
```java
class Solution {
    public int maxProfit(int[] prices) {
        int k = 2;
        int n = prices.length;
        if (n == 0) return 0;

        int[] buy = new int[k + 1];
        int[] sell = new int[k + 1];
        Arrays.fill(buy, Integer.MIN_VALUE);

        for (int price : prices) {
            for (int t = 1; t <= k; t++) {
                buy[t] = Math.max(buy[t], sell[t - 1] - price);
                sell[t] = Math.max(sell[t], buy[t] + price);
            }
        }
        return sell[k];
    }
}
```
*(needs `import java.util.Arrays;`)*

## Key Takeaways
- Model "at most 2 transactions" as 4 explicit states (buy1, sell1, buy2, sell2) updated as running maxima in one left-to-right pass.
- `buyT` stores a *balance* (can be negative, i.e. cash spent), `sellT` stores a *profit* (always ≥ 0 since `sell[0] = 0`).
- This is the `k = 2` special case of the general "at most k transactions" DP — recognizing the template avoids re-deriving it for Stock IV.
