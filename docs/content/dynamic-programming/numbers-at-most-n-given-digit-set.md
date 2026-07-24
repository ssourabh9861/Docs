# Numbers At Most N Given Digit Set

**Difficulty:** Hard · **Pattern:** Digit DP — count by length, then scan the tight prefix position by position · [LeetCode](https://leetcode.com/problems/numbers-at-most-n-given-digit-set/)

## Problem
Given a sorted array of single-digit strings `digits` (repetition allowed when building a number) and a positive integer `n`, return how many positive integers `<= n` can be formed using only digits from `digits`.

## Examples
**Example 1**
```
Input:  digits = ["1","3","5","7"], n = 100
Output: 20
Explanation: 1-digit numbers: 1,3,5,7 (4). 2-digit numbers: 11,13,...,77 (16). Total 20; nothing 3-digit is <= 100.
```

**Example 2**
```
Input:  digits = ["1","4","9"], n = 1000000000
Output: 29523
Explanation: Sum over lengths 1..9 (3^len each) plus the exact 9-digit numbers <= n formed under the tight bound.
```

## Constraints
- 1 <= digits.length <= 9
- digits[i] is a single digit from '1' to '9' (no repeats within `digits`, sorted ascending)
- 1 <= n <= 10^9

## Approach 1 — Brute force membership check
**Idea.** Walk every integer `x` from 1 to `n` and check whether each of its decimal digits appears in the allowed set. This directly mirrors the problem statement but ignores the fact that `n` can be up to `10^9`, making it far too slow in practice — useful only to sanity-check the DP on tiny inputs.
**Complexity.** Time O(n · log n), Space O(1).
```java
class Solution {
    public int atMostNGivenDigitSet(String[] digits, int n) {
        Set<Character> allowed = new HashSet<>();
        for (String d : digits) allowed.add(d.charAt(0));

        int count = 0;
        for (int x = 1; x <= n; x++) {
            if (usesOnlyAllowedDigits(x, allowed)) count++;
        }
        return count;
    }

    private boolean usesOnlyAllowedDigits(int x, Set<Character> allowed) {
        for (char c : Integer.toString(x).toCharArray()) {
            if (!allowed.contains(c)) return false;
        }
        return true;
    }
}
```

## Approach 2 — Digit DP by length + tight-prefix scan (optimal)
**Idea.** Let `s` be the decimal string of `n` with length `K`, and `D = digits.length`.
- **Shorter numbers.** Any number with fewer than `K` digits is automatically `<= n`, and every position can be filled freely from `digits`: that contributes `D^len` for each `len` from 1 to `K-1`.
- **Same-length numbers (the tight scan).** Walk `s` position by position, playing the role of `dp(pos, tight=true)`. At position `i`, for every allowed digit strictly less than `s[i]`, the remaining `K-i-1` positions can be filled completely freely, contributing `D^(K-i-1)` numbers that are guaranteed `< n`. If `s[i]` itself is an allowed digit, continue matching it exactly (`tight` stays true for the next position); otherwise the tight branch dies here and we stop. If we successfully match every position with an allowed digit, `n` itself is also achievable, so add 1 at the end.

This is digit DP with `tight` as the only real branching state — there's no "leading zero" flag needed since `digits` never contains '0' and numbers are always positive.
**Complexity.** Time O(K · D), Space O(1).
```java
class Solution {
    public int atMostNGivenDigitSet(String[] digits, int n) {
        String s = Integer.toString(n);
        int k = s.length();
        int d = digits.length;
        int result = 0;

        // Numbers with fewer digits than n: every position is free
        int power = 1;
        for (int len = 1; len < k; len++) {
            power *= d;
            result += power;
        }

        // Numbers with exactly k digits, bounded by n (tight scan)
        for (int i = 0; i < k; i++) {
            char sd = s.charAt(i);
            boolean matched = false;
            for (String digit : digits) {
                char dc = digit.charAt(0);
                if (dc < sd) {
                    result += (int) Math.pow(d, k - i - 1);
                } else if (dc == sd) {
                    matched = true;
                }
            }
            if (!matched) return result; // tight path dies: no exact-length match possible
        }
        // matched every position exactly -> n itself is achievable
        return result + 1;
    }
}
```

## Key Takeaways
- Split the count into "shorter than n" (always free) and "exactly as long as n" (needs the tight scan) — this decomposition recurs in every digit DP problem in this batch.
- Because `digits` is sorted, the inner loop can also be short-circuited with binary search, but a linear scan over at most 9 digits is already O(1) per position.
- `n` itself must be checked as a special case at the end of the tight scan — it's easy to forget and off-by-one the final count.
