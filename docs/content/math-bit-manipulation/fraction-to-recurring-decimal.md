# Fraction to Recurring Decimal

**Difficulty:** Hard · **Pattern:** Long division + remainder-position HashMap for repeating cycle detection · [LeetCode](https://leetcode.com/problems/fraction-to-recurring-decimal/)

## Problem
Given two integers representing the numerator and denominator of a fraction, return the fraction as a string in decimal form. If the decimal part repeats, enclose the repeating portion in parentheses.

## Examples
**Example 1**
```
Input:  numerator = 1, denominator = 2
Output: "0.5"
```

**Example 2**
```
Input:  numerator = 2, denominator = 1
Output: "2"
```

**Example 3**
```
Input:  numerator = 4, denominator = 333
Output: "0.(012)"
Explanation: 4/333 = 0.012012012... repeating "012" forever.
```

## Constraints
- `-2^31 <= numerator, denominator <= 2^31 - 1`
- `denominator != 0`

## Approach 1 — Simulated long division with a remainder map
**Idea.** Simulate manual long division: at each step, multiply the current remainder by 10 and divide by the denominator to get the next digit, then keep the new remainder. A repeating decimal occurs exactly when a remainder value reappears — at that point, everything since its first occurrence repeats forever, so record `remainder -> position in the result string` in a `HashMap`. When a remainder repeats, insert `(` at the stored position and close with `)` at the end.

Correctness details:
- **Sign:** the result is negative iff exactly one of numerator/denominator is negative (and the value is nonzero). Compute using `long` and take absolute values to avoid `Integer.MIN_VALUE` overflow (`-Integer.MIN_VALUE` doesn't fit in `int`).
- **Integer part:** if it divides evenly, return immediately with no decimal point.
- **Termination:** if remainder becomes 0, the decimal terminates cleanly (no repeating group).
**Complexity.** Time O(denominator) worst case (at most `denominator` distinct remainders before one repeats), Space O(denominator) for the map.
```java
import java.util.HashMap;
import java.util.Map;

class Solution {
    public String fractionToDecimal(int numerator, int denominator) {
        if (numerator == 0) return "0";

        StringBuilder sb = new StringBuilder();

        // Use long to safely negate Integer.MIN_VALUE.
        long num = numerator;
        long den = denominator;

        boolean negative = (num < 0) ^ (den < 0);
        if (negative) sb.append('-');

        num = Math.abs(num);
        den = Math.abs(den);

        long integerPart = num / den;
        long remainder = num % den;
        sb.append(integerPart);

        if (remainder == 0) {
            return sb.toString(); // divides evenly, no fractional part
        }

        sb.append('.');

        Map<Long, Integer> remainderPosition = new HashMap<>();
        StringBuilder fraction = new StringBuilder();

        while (remainder != 0) {
            if (remainderPosition.containsKey(remainder)) {
                int start = remainderPosition.get(remainder);
                fraction.insert(start, "(");
                fraction.append(")");
                break;
            }
            remainderPosition.put(remainder, fraction.length());
            remainder *= 10;
            fraction.append(remainder / den);
            remainder %= den;
        }

        sb.append(fraction);
        return sb.toString();
    }
}
```

## Approach 2 — Same algorithm, precomputed sign/edge-case guard (optimal — same complexity, cleaner structure)
**Idea.** This problem has one core algorithm (long division with cycle detection via remainder positions); the "optimal" refinement is really about being airtight on edge cases rather than a different asymptotic approach: handling `numerator == 0` up front, guarding `Integer.MIN_VALUE` via `long`, and avoiding double negative signs (e.g. `-1 / -2` must not print `-0.5`). The structure below folds those guards directly into a single clean pass.
**Complexity.** Time O(denominator), Space O(denominator).
```java
import java.util.HashMap;
import java.util.Map;

class Solution {
    public String fractionToDecimal(int numerator, int denominator) {
        long num = numerator, den = denominator;
        if (num == 0) return "0";

        StringBuilder result = new StringBuilder();
        if ((num < 0) ^ (den < 0)) result.append('-');
        num = Math.abs(num);
        den = Math.abs(den);

        result.append(num / den);
        long rem = num % den;
        if (rem == 0) return result.toString();

        result.append('.');
        Map<Long, Integer> seen = new HashMap<>();

        while (rem != 0) {
            Integer priorIndex = seen.get(rem);
            if (priorIndex != null) {
                result.insert(priorIndex, "(");
                result.append(')');
                break;
            }
            seen.put(rem, result.length());
            rem *= 10;
            result.append(rem / den);
            rem %= den;
        }
        return result.toString();
    }
}
```

## Key Takeaways
- A repeating decimal cycle is detected the moment a division *remainder* reoccurs — record `remainder -> output position`, not the digit itself, since the same digit can appear without starting a repeat.
- Guard `Integer.MIN_VALUE` by widening to `long` before calling `Math.abs`, otherwise negation overflows.
- Determine the sign with `(num < 0) ^ (den < 0)` computed once up front, then work with absolute values throughout to keep the division logic simple.
