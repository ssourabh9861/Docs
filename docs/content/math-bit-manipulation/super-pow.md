# Super Pow

**Difficulty:** Hard · **Pattern:** Modular exponentiation, digit-by-digit (Horner's rule under a modulus) · [LeetCode](https://leetcode.com/problems/super-pow/)

## Problem
Given a positive integer `a` and a huge positive integer `b` represented as an array of digits, compute `a^b mod 1337`. The exponent `b` can have up to `2000` digits, far too large to fit in any native integer type.

## Examples
**Example 1**
```
Input:  a = 2, b = [3]
Output: 8
```

**Example 2**
```
Input:  a = 2, b = [1,0]
Output: 1024
```

**Example 3**
```
Input:  a = 1, b = [4,3,3,8,5,2,1,1,7,0]
Output: 1
```

## Constraints
- `1 <= a <= 2^31 - 1`
- `1 <= b.length <= 2000`
- `0 <= b[i] <= 9`
- `b` doesn't contain leading zeros.

## Approach 1 — Digit-by-digit Horner's rule with modular exponentiation
**Idea.** Treat `b` as a base-10 number processed left to right using the identity:
```
a^(10*x + d) = (a^x)^10 * a^d
```
So if `r` is the running result for the prefix processed so far, the next digit `d` updates it as `r = pow(r, 10) * pow(a, d) mod 1337`. This is Horner's rule for exponents: build up the exponent digit by digit while keeping everything under the modulus, so we never need to materialize the actual (huge) exponent as a number. Each `pow` call is a small fixed-exponent (10 or ≤9) modular exponentiation, itself done via fast exponentiation.
**Complexity.** Time O(L) where L = `b.length` (each step does O(1) work since exponents 10 and ≤9 are constant-size), Space O(1) excluding input.
```java
class Solution {
    private static final int MOD = 1337;

    public int superPow(int a, int[] b) {
        int result = 1;
        int base = a % MOD;

        for (int digit : b) {
            result = modPow(result, 10, MOD) * modPow(base, digit, MOD) % MOD;
        }
        return result;
    }

    private int modPow(int base, int exp, int mod) {
        base %= mod;
        long result = 1;
        long b = base;
        while (exp > 0) {
            if ((exp & 1) == 1) {
                result = (result * b) % mod;
            }
            b = (b * b) % mod;
            exp >>= 1;
        }
        return (int) result;
    }
}
```

## Approach 2 — Same recurrence via explicit recursion on the digit array (optimal, equivalent complexity)
**Idea.** Express the same recurrence recursively instead of iteratively: peel off the last digit of `b` each call, so `superPow(a, b) = pow(superPow(a, b[0..n-2]), 10) * pow(a, b[n-1]) mod 1337`, with the base case being an empty array (`= 1`). This is mathematically identical to Approach 1 — same digit-by-digit Horner recurrence — just expressed top-down via recursion instead of a left-to-right loop, useful when the array is naturally consumed via `Arrays.copyOfRange` or when integrating into a larger recursive-descent-style codebase.
**Complexity.** Time O(L), Space O(L) for the recursion stack (vs O(1) for the iterative version).
```java
import java.util.Arrays;

class Solution {
    private static final int MOD = 1337;

    public int superPow(int a, int[] b) {
        return superPowHelper(a % MOD, b);
    }

    private int superPowHelper(int a, int[] b) {
        if (b.length == 0) return 1;

        int lastDigit = b[b.length - 1];
        int[] rest = Arrays.copyOfRange(b, 0, b.length - 1);

        int part1 = modPow(superPowHelper(a, rest), 10, MOD);
        int part2 = modPow(a, lastDigit, MOD);
        return (part1 * part2) % MOD;
    }

    private int modPow(int base, int exp, int mod) {
        base %= mod;
        long result = 1;
        long b = base;
        while (exp > 0) {
            if ((exp & 1) == 1) {
                result = (result * b) % mod;
            }
            b = (b * b) % mod;
            exp >>= 1;
        }
        return (int) result;
    }
}
```

## Key Takeaways
- The core trick is `a^(10x + d) = (a^x)^10 * a^d`, which lets an arbitrarily large exponent (given digit-by-digit) be consumed one digit at a time under a modulus — no big-integer arithmetic needed.
- Apply `% MOD` after every multiplication to keep intermediate values small; use `long` inside `modPow` to avoid `int` overflow during the squaring step.
- The iterative left-to-right version (Approach 1) is preferable in practice — same time complexity but O(1) space instead of O(L) recursion stack.
