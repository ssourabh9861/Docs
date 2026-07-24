# Power of Two / Power of Three / Power of Four

**Difficulty:** Medium · **Pattern:** single-bit checks via `n & (n-1)`, mod/log tricks for base-3, and a bitmask (`0x55555555`) to distinguish powers of 4 from powers of 2 · [LeetCode](https://leetcode.com/problems/power-of-two/) / [LeetCode](https://leetcode.com/problems/power-of-three/) / [LeetCode](https://leetcode.com/problems/power-of-four/)

## Problem
Given an integer `n`, determine whether it is a power of two, a power of three, or a power of four, respectively (i.e. whether there exists a non-negative integer `x` such that `n == base^x`).

## Examples
**Example 1 (Power of Two)**
```
Input:  n = 16
Output: true
Explanation: 16 = 2^4.
```

**Example 2 (Power of Three)**
```
Input:  n = 45
Output: false
Explanation: 45 is not any power of 3 (27 and 81 are the neighbors).
```

**Example 3 (Power of Four)**
```
Input:  n = 16
Output: true
Explanation: 16 = 4^2. Note 16 is also a power of two, but not every power of two is a power of four (e.g. 8 is not).
```

## Constraints
- -2^31 <= n <= 2^31 - 1 (all three problems; negative and zero must return false).

## Approach 1 — Power of Two via `n & (n-1)`
**Idea.** A power of two has exactly one bit set in binary (e.g. `1000`). Subtracting 1 flips that bit and all bits below it (e.g. `0111`), so ANDing `n` with `n-1` clears the single set bit, yielding 0 only when `n` had exactly one bit set. Must also guard `n > 0` since the identity is meaningless (or falsely true) for `n <= 0`.
**Complexity.** Time O(1), Space O(1).
```java
class PowerOfTwo {
    public boolean isPowerOfTwo(int n) {
        return n > 0 && (n & (n - 1)) == 0;
    }
}
```

## Approach 2 — Power of Three via repeated division (general, no overflow tricks)
**Idea.** Repeatedly divide `n` by 3 while it's divisible, until it no longer is; `n` was a power of three iff the process ends at exactly 1. This works for any base and avoids relying on datatype-width overflow tricks, at the cost of a small loop instead of O(1) work.
**Complexity.** Time O(log_3 n), Space O(1).
```java
class PowerOfThree {
    public boolean isPowerOfThree(int n) {
        if (n < 1) return false;
        while (n % 3 == 0) {
            n /= 3;
        }
        return n == 1;
    }
}
```

## Approach 3 — Power of Three via largest-power-of-3-in-int-range trick (optimal, O(1))
**Idea.** 3 is prime, so the largest power of 3 that fits in a signed 32-bit int (3^19 = 1162261467) is divisible only by earlier powers of three. Thus `n` is a power of three iff `n > 0` and `1162261467 % n == 0`.
**Complexity.** Time O(1), Space O(1).
```java
class PowerOfThreeOptimal {
    public boolean isPowerOfThree(int n) {
        return n > 0 && 1162261467 % n == 0;
    }
}
```

## Approach 4 — Power of Four via bitmask (optimal)
**Idea.** A power of four must first be a power of two (`n & (n-1) == 0`), and additionally its single set bit must sit at an even position (bit 0, 2, 4, ...) since 4^k = 2^(2k). The constant `0x55555555` has 1s at exactly those even bit positions (`...01010101`); ANDing with it confirms the set bit lands on one of them.
**Complexity.** Time O(1), Space O(1).
```java
class PowerOfFour {
    public boolean isPowerOfFour(int n) {
        return n > 0 && (n & (n - 1)) == 0 && (n & 0x55555555) != 0;
    }
}
```

## Key Takeaways
- `n & (n-1) == 0` (with `n > 0`) is the universal test for "exactly one bit set," i.e. power of two.
- For power-of-4, layering an even-bit-position mask (`0x55555555`) on top of the power-of-two check distinguishes 4^k from other powers of 2 without looping or using logarithms.
- For non-power-of-2 bases like 3, exploit primality: find the largest power of the base representable in the integer width, and check divisibility — this converts an O(log n) loop into O(1).
- Always special-case `n <= 0`: none of these bit tricks are meaningful (or safe) for non-positive inputs.
