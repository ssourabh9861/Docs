# Nth Magical Number

**Difficulty:** Hard · **Pattern:** Binary search on the answer + inclusion-exclusion via LCM · [LeetCode](https://leetcode.com/problems/nth-magical-number/)

## Problem
A positive integer is *magical* if it is divisible by either `a` or `b`. Given `n`, `a`, and `b`, return the `n`-th magical number, modulo `10^9 + 7`.

## Examples
**Example 1**
```
Input:  n = 1, a = 2, b = 3
Output: 2
Explanation: The magical numbers in order are 2, 3, 4, 6, 8, 9, ...
```

**Example 2**
```
Input:  n = 4, a = 2, b = 3
Output: 6
Explanation: Sequence: 2, 3, 4, 6, ... the 4th term is 6.
```

## Constraints
- `1 <= n <= 10^9`
- `2 <= a, b <= 4 * 10^4`

## Approach 1 — Simulation / merge two sequences
**Idea.** Walk through multiples of `a` and `b` in sorted order (two-pointer merge, like merging sorted lists), counting magical numbers (skipping double-counted common multiples) until reaching the `n`-th one. Correct, but with `n` up to `10^9` this performs up to a billion steps — far too slow.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int nthMagicalNumber(int n, int a, int b) {
        final int MOD = 1_000_000_007;
        long multipleA = a, multipleB = b;
        long result = 0;

        for (int i = 0; i < n; i++) {
            if (multipleA < multipleB) {
                result = multipleA;
                multipleA += a;
            } else if (multipleB < multipleA) {
                result = multipleB;
                multipleB += b;
            } else { // equal: common multiple, counts once
                result = multipleA;
                multipleA += a;
                multipleB += b;
            }
        }
        return (int) (result % MOD);
    }
}
```

## Approach 2 — Binary search on the value + inclusion-exclusion (optimal)
**Idea.** Define `count(V) = V/a + V/b - V/lcm(a,b)` — the number of magical numbers `<= V`, by inclusion-exclusion over "multiples of a" and "multiples of b", subtracting the double-counted common multiples of `lcm(a, b)`. This function is monotonically non-decreasing in `V`, so binary search for the smallest `V` with `count(V) >= n`; that `V` is exactly the n-th magical number (it must itself be a multiple of `a` or `b`, since `count` only increases at magical numbers). Only take `% MOD` on the final returned value — never during the search, since the search relies on true numeric ordering, not modular values.
**Complexity.** Time O(log(n · min(a, b))), Space O(1).
```java
class Solution {
    public int nthMagicalNumber(int n, int a, int b) {
        final int MOD = 1_000_000_007;
        long lcm = (long) a / gcd(a, b) * b;

        long lo = 1;
        long hi = (long) n * Math.min(a, b); // upper bound: n-th multiple of the smaller of a, b

        while (lo < hi) {
            long mid = lo + (hi - lo) / 2;
            long count = mid / a + mid / b - mid / lcm;
            if (count < n) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return (int) (lo % MOD);
    }

    private long gcd(long x, long y) {
        while (y != 0) {
            long t = y;
            y = x % y;
            x = t;
        }
        return x;
    }
}
```

## Key Takeaways
- `count(V) = V/a + V/b - V/lcm(a,b)` is the classic inclusion-exclusion formula for "divisible by a or b," and it is monotonic in `V`, making it a perfect predicate for binary search on the answer.
- Never apply the modulus during the binary search — the comparisons `count(mid) >= n` require true numeric values; only mod the final answer once it's found.
- The naive merge-simulation approach is intuitive but scales with `n` itself (up to `10^9`), whereas binary search scales with `log(n · min(a,b))`, a difference of many orders of magnitude.
