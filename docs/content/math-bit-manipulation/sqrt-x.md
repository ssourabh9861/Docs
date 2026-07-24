# Sqrt(x)

**Difficulty:** Medium · **Pattern:** Binary search on the answer (integer square root) · [LeetCode](https://leetcode.com/problems/sqrtx/)

## Problem
Given a non-negative integer `x`, return the square root of `x` rounded down to the nearest integer. The returned integer should be non-negative as well.

## Examples
**Example 1**
```
Input:  x = 4
Output: 2
```

**Example 2**
```
Input:  x = 8
Output: 2
Explanation: sqrt(8) = 2.828..., truncated to 2.
```

## Constraints
- `0 <= x <= 2^31 - 1`

## Approach 1 — Binary search on the answer
**Idea.** The function `f(k) = k*k` is monotonic for `k >= 0`, so we can binary search for the largest `k` such that `k*k <= x`. Use `long` for the square to avoid overflow when `k` approaches `2^16`ish and `x` is near `Integer.MAX_VALUE`.
**Complexity.** Time O(log x), Space O(1).
```java
class Solution {
    public int mySqrt(int x) {
        if (x < 2) return x;

        long lo = 1, hi = x;
        long ans = 1;
        while (lo <= hi) {
            long mid = lo + (hi - lo) / 2;
            long square = mid * mid;
            if (square == x) {
                return (int) mid;
            } else if (square < x) {
                ans = mid;      // mid is a valid candidate, try bigger
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return (int) ans;
    }
}
```

## Approach 2 — Newton's method (optimal in practice)
**Idea.** Newton's method for finding roots of `f(k) = k^2 - x` gives the iteration `k_new = (k + x/k) / 2`, which converges quadratically (doubles the number of correct digits each step) — much faster than binary search in practice, though both are O(log x) worst case for bounded integers. Start with a guess (e.g. `x`) and iterate until the guess stops decreasing (stabilizes at or just above the true root), then step down if needed to satisfy the floor condition.
**Complexity.** Time O(log x) amortized (typically far fewer iterations than binary search), Space O(1).
```java
class Solution {
    public int mySqrt(int x) {
        if (x < 2) return x;

        long guess = x;
        while (guess * guess > x) {
            guess = (guess + x / guess) / 2;
        }
        return (int) guess;
    }
}
```

## Key Takeaways
- Binary search on the answer works whenever the predicate `k*k <= x` is monotonic in `k` — a common template for "compute an integer function without built-in support."
- Use `long` for intermediate squares to prevent overflow when `x` is close to `Integer.MAX_VALUE`.
- Newton's method converges much faster than bisection for this specific problem and is a good alternative to know for interviews.
