# Count Numbers with Unique Digits

**Difficulty:** Medium · **Pattern:** Digit counting by length — a warm-up before full digit DP · [LeetCode](https://leetcode.com/problems/count-numbers-with-unique-digits/)

## Problem
Given an integer `n`, return the count of all integers `x` with unique digits, where `0 <= x < 10^n`.

## Examples
**Example 1**
```
Input:  n = 2
Output: 91
Explanation: Total numbers in [0, 100) minus the 9 numbers with repeated digits (11, 22, ..., 99).
```

**Example 2**
```
Input:  n = 0
Output: 1
Explanation: Only x = 0 lies in [0, 10^0) = [0, 1).
```

## Constraints
- 0 <= n <= 8

## Approach 1 — Brute force with a digit bitmask
**Idea.** For every candidate `x` in `[0, 10^n)`, peel off digits one at a time and record each one in a 10-bit mask. If a digit is already set in the mask, `x` has a repeat and is rejected; otherwise it counts. This is a direct simulation of the definition — no DP state is needed because the search space is tiny (`n <= 8` keeps `10^n` bounded).
**Complexity.** Time O(10^n · n), Space O(1).
```java
class Solution {
    public int countNumbersWithUniqueDigits(int n) {
        int upper = (int) Math.pow(10, n);
        int count = 0;
        for (int x = 0; x < upper; x++) {
            if (hasUniqueDigits(x)) count++;
        }
        return count;
    }

    private boolean hasUniqueDigits(int x) {
        if (x == 0) return true;
        int mask = 0;
        while (x > 0) {
            int d = x % 10;
            if ((mask & (1 << d)) != 0) return false;
            mask |= (1 << d);
            x /= 10;
        }
        return true;
    }
}
```

## Approach 2 — Combinatorial counting (optimal)
**Idea.** Define `f(k)` = number of exactly-`k`-digit numbers (no leading zero) with all unique digits. The state is "how many positions are left to fill and how many fresh digit choices remain": the first digit has 9 choices (1–9), the second has 9 remaining choices (0–9 minus the first), the third has 8, and so on — a falling-factorial recurrence `f(k) = f(k-1) · (available pool)`, with the pool shrinking by one each step and bottoming out at 0 once 10 digits are used. The answer for `n` is `f(0) + f(1) + ... + f(n)`, where `f(0) = 1` accounts for the number 0 itself.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int countNumbersWithUniqueDigits(int n) {
        if (n == 0) return 1;

        int total = 10;           // f(0) + f(1) = 1 + 9
        int uniqueCountAtK = 9;    // f(1): first digit has 9 choices
        int availablePool = 9;     // digits left over after the first position

        for (int k = 2; k <= n && availablePool > 0; k++) {
            uniqueCountAtK *= availablePool;
            total += uniqueCountAtK;
            availablePool--;
        }
        return total;
    }
}
```

## Key Takeaways
- The bitmask brute force is correct but exponential; it only survives here because `n <= 8` caps the range at `10^8`.
- The combinatorial recurrence is a falling factorial (permutations of digits), not a bound-tracking digit DP — there is no "tight" prefix to respect since we sum over *all* numbers of each length, not numbers below a specific `n`.
- This problem is the natural on-ramp to the rest of the batch: once a specific upper bound `N` (not just a power of ten) enters the picture, you need the full `dp(pos, tight, ...)` machinery seen in the following problems.
