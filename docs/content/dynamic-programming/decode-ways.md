# Decode Ways

**Difficulty:** Medium · **Pattern:** 1-D DP — count ways via last-one/last-two-digit transitions · [LeetCode](https://leetcode.com/problems/decode-ways/)

## Problem
A message of digits can be decoded to letters using 'A'->1 ... 'Z'->26. Given a digit string `s`, count the number of ways it can be decoded, treating leading zeros / invalid codes as dead ends.

## Examples
**Example 1**
```
Input:  s = "226"
Output: 3
Explanation: "226" decodes as "BZ" (2 26), "VF" (22 6), or "BBF" (2 2 6).
```

**Example 2**
```
Input:  s = "06"
Output: 0
Explanation: "06" cannot be mapped to a letter (leading zero is invalid), so no valid decoding exists.
```

## Constraints
- 1 <= s.length <= 100
- s consists of digits and may contain leading zeros.

## Approach 1 — Top-Down Memoization
**Idea.** Define `f(i)` = number of ways to decode the suffix `s[i..n-1]`. Base case `f(n) = 1` (empty suffix, one way — decoded nothing left). At index `i`: if `s[i] == '0'`, no valid decoding starts here, `f(i) = 0`. Otherwise take the one-digit code (`s[i]`) contributing `f(i+1)`, and if `i+1 < n` and the two-digit code `s[i..i+1]` is between 10 and 26, add `f(i+2)`.
`f(i) = [s[i] != '0'] * f(i+1) + [valid two-digit] * f(i+2)`.

**Complexity.** Time O(n), Space O(n) (recursion + memo).
```java
class Solution {
    private Integer[] memo;
    private String s;

    public int numDecodings(String s) {
        this.s = s;
        this.memo = new Integer[s.length() + 1];
        return f(0);
    }

    private int f(int i) {
        int n = s.length();
        if (i == n) return 1;
        if (s.charAt(i) == '0') return 0;
        if (memo[i] != null) return memo[i];

        int ways = f(i + 1); // one-digit decode
        if (i + 1 < n) {
            int twoDigit = (s.charAt(i) - '0') * 10 + (s.charAt(i + 1) - '0');
            if (twoDigit >= 10 && twoDigit <= 26) {
                ways += f(i + 2);
            }
        }
        return memo[i] = ways;
    }
}
```

## Approach 2 — Bottom-Up, O(1) Space
**Idea.** Same recurrence read left-to-right instead: `dp[i]` = ways to decode prefix `s[0..i-1]`. `dp[0] = 1` (empty prefix). For `i >= 1`: if `s[i-1] != '0'`, `dp[i] += dp[i-1]`. If `i >= 2` and the two-digit number formed by `s[i-2..i-1]` is in `[10, 26]`, `dp[i] += dp[i-2]`. Since only the last two values are read, roll them into two variables.

**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int numDecodings(String s) {
        int n = s.length();
        if (n == 0 || s.charAt(0) == '0') return 0;

        int prev2 = 1; // dp[i-2], starts as dp[0]
        int prev1 = 1; // dp[i-1], starts as dp[1] (first char is non-zero, checked above)

        for (int i = 2; i <= n; i++) {
            int cur = 0;
            char oneDigitChar = s.charAt(i - 1);
            if (oneDigitChar != '0') {
                cur += prev1;
            }
            int twoDigit = (s.charAt(i - 2) - '0') * 10 + (s.charAt(i - 1) - '0');
            if (twoDigit >= 10 && twoDigit <= 26) {
                cur += prev2;
            }
            prev2 = prev1;
            prev1 = cur;
        }
        return prev1;
    }
}
```

## Key Takeaways
- Treat this like a "count paths" DP: each position offers up to two moves forward (1 digit or 2 digits), like a restricted staircase problem.
- Leading zero in a substring immediately kills that branch — check it before forming the two-digit number.
- Bottom-up with two rolling variables gets O(1) space; watch off-by-one indices carefully between the string index and the dp index.
