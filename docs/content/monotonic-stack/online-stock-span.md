# Online Stock Span

**Difficulty:** Medium · **Pattern:** monotonic decreasing stack storing (value, span) pairs, amortized O(1) per call · [LeetCode](https://leetcode.com/problems/online-stock-span/)

## Problem
Design an algorithm that collects daily stock price quotes and returns the **span** of the stock's price for the current day: the maximum number of consecutive days (including today, going backwards) for which the price was less than or equal to today's price. Implement `StockSpanner` with a single method `next(int price)` called once per day, in order.

## Examples
**Example 1**
```
Input:
["StockSpanner", "next", "next", "next", "next", "next", "next", "next"]
[[], [100], [80], [60], [70], [60], [75], [85]]
Output:
[null, 1, 1, 1, 2, 1, 4, 6]
Explanation: prices = [100,80,60,70,60,75,85]
next(100) -> 1 (just today)
next(80)  -> 1 (80 < 100)
next(60)  -> 1 (60 < 80)
next(70)  -> 2 (70 >= 60, so include day with 60 too)
next(60)  -> 1
next(75)  -> 4 (75 >= 60,70,60, stops at 80)
next(85)  -> 6 (85 >= all of 75,60,70,60,80, stops before 100)
```

## Constraints
- `1 <= price <= 10^5`
- At most `10^4` calls to `next`.

## Approach 1 — Brute Force
**Idea.** Store all prices seen so far in a list. On each `next(price)` call, scan backward from the most recent day, counting consecutive days with price `<= price`, stopping at the first day with a strictly greater price.
**Complexity.** Time O(n) per call, O(n^2) total across all calls, Space O(n).
```java
class StockSpanner {
    private final List<Integer> prices = new ArrayList<>();

    public int next(int price) {
        prices.add(price);
        int span = 0;
        for (int i = prices.size() - 1; i >= 0; i--) {
            if (prices.get(i) > price) break;
            span++;
        }
        return span;
    }
}
```

## Approach 2 — Monotonic Stack of (price, span) Pairs (optimal)
**Idea.** Maintain a stack of `(price, span)` pairs with strictly **decreasing** prices from bottom to top. When a new price arrives, pop every pair whose price is `<= price`, accumulating their spans into the new day's span (those days are now "absorbed" — any future day querying back that far will pass through today instead). Push `(price, accumulatedSpan)`.
**Complexity.** Time O(1) amortized per call (each day is pushed once and popped at most once across the whole run), Space O(n).
```java
class StockSpanner {
    private final Deque<int[]> stack = new ArrayDeque<>(); // [price, span], prices strictly decreasing

    public int next(int price) {
        int span = 1;
        while (!stack.isEmpty() && stack.peek()[0] <= price) {
            span += stack.pop()[1];
        }
        stack.push(new int[]{price, span});
        return span;
    }
}
```

## Key Takeaways
- Storing `(value, span)` pairs instead of raw prices lets absorbed days contribute their whole span in one O(1) step, instead of being re-walked individually — the key idea that gets amortized O(1) per call.
- Amortized analysis: each day is pushed exactly once and popped at most once over the lifetime of the object, so total work across `n` calls is O(n), even though a single call can pop many elements.
- This is the "previous greater element" pattern applied incrementally/online, rather than over a static array in one pass.
- Related: Daily Temperatures (same previous/next greater idea over a static array), Asteroid Collision (stack absorbs/cancels elements similarly).
