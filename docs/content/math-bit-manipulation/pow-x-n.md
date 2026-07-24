# Pow(x, n)

**Difficulty:** Medium · **Pattern:** Fast exponentiation (binary exponentiation) · [LeetCode](https://leetcode.com/problems/powx-n/)

## Problem
Implement `pow(x, n)`, which calculates `x` raised to the power `n` (i.e. `x^n`), where `n` can be negative, zero, or positive, including `Integer.MIN_VALUE`.

## Examples
**Example 1**
```
Input:  x = 2.00000, n = 10
Output: 1024.00000
```

**Example 2**
```
Input:  x = 2.10000, n = 3
Output: 9.26100
```

**Example 3**
```
Input:  x = 2.00000, n = -2
Output: 0.25000
Explanation: 2^-2 = 1/2^2 = 1/4 = 0.25
```

## Constraints
- `-100.0 < x < 100.0`
- `-2^31 <= n <= 2^31 - 1`
- `n` is an integer.
- Either `x != 0` or `n > 0`.
- `-10^4 <= x^n <= 10^4`

## Approach 1 — Naive iterative multiplication
**Idea.** Multiply `x` by itself `|n|` times, then invert if `n` is negative. Correct but far too slow for large `n` (up to ~2^31), so it only serves as a baseline.
**Complexity.** Time O(|n|), Space O(1).
```java
class Solution {
    public double myPow(double x, int n) {
        long N = n; // widen to avoid overflow when negating Integer.MIN_VALUE
        boolean negative = N < 0;
        if (negative) N = -N;

        double result = 1.0;
        for (long i = 0; i < N; i++) {
            result *= x;
        }
        return negative ? 1.0 / result : result;
    }
}
```

## Approach 2 — Binary exponentiation (optimal)
**Idea.** Repeatedly square the base and halve the exponent: `x^n = (x^(n/2))^2` when `n` is even, and `x^n = x * (x^(n/2))^2` when `n` is odd. This is the standard "fast power" trick. The key correctness detail is handling `n = Integer.MIN_VALUE`: negating it overflows a 32-bit int, so cast `n` to `long` before negating. Implemented iteratively to avoid recursion overhead/stack depth.
**Complexity.** Time O(log |n|), Space O(1).
```java
class Solution {
    public double myPow(double x, int n) {
        long N = n;
        if (N < 0) {
            x = 1 / x;
            N = -N;
        }

        double result = 1.0;
        double current = x;
        while (N > 0) {
            if ((N & 1) == 1) {
                result *= current;
            }
            current *= current;
            N >>= 1;
        }
        return result;
    }
}
```

## Key Takeaways
- Binary exponentiation reduces O(n) multiplications to O(log n) by squaring the base and halving the exponent each step.
- Always widen `n` to `long` before negating — `-Integer.MIN_VALUE` overflows `int`.
- Take the reciprocal of `x` once up front for negative exponents instead of dividing at the end, which keeps the loop uniform.
