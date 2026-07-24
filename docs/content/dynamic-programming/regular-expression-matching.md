# Regular Expression Matching

**Difficulty:** Hard · **Pattern:** 2D boolean DP with `.` (any char) and `*` (zero-or-more of preceding char) · [LeetCode](https://leetcode.com/problems/regular-expression-matching/)

## Problem
Given a string `s` and a pattern `p` containing `.` and `*`, implement regular expression matching that covers the entire string (not partial). `.` matches any single character; `*` matches zero or more of the *preceding* element.

## Examples
**Example 1**
```
Input:  s = "aa", p = "a*"
Output: true
Explanation: 'a*' means zero or more of 'a'; it matches "aa" by using
'a' twice.
```

**Example 2**
```
Input:  s = "mississippi", p = "mis*is*p*."
Output: false
```

## Constraints
- `1 <= s.length <= 20`, `1 <= p.length <= 30`
- `p` contains only lowercase letters, `.`, and `*`; a `*` is never at position 0 and always follows a valid character.

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be true if `s[0..i)` matches `p[0..j)`. If `p[j-1]` is a normal character or `.`, it must match `s[i-1]` and `dp[i-1][j-1]` must hold. If `p[j-1] == '*'`, it stands for "zero occurrences of `p[j-2]`" (`dp[i][j-2]`) OR "one more occurrence of `p[j-2]`" (`p[j-2]` matches `s[i-1]` and `dp[i-1][j]` holds). Base row `dp[0][j]` handles patterns like `a*b*c*` matching the empty string.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public boolean isMatch(String s, String p) {
        int m = s.length(), n = p.length();
        boolean[][] dp = new boolean[m + 1][n + 1];
        dp[0][0] = true;
        for (int j = 1; j <= n; j++) {
            if (p.charAt(j - 1) == '*') {
                dp[0][j] = dp[0][j - 2];
            }
        }

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                char pc = p.charAt(j - 1);
                if (pc == '*') {
                    char prevPatChar = p.charAt(j - 2);
                    boolean zeroOcc = dp[i][j - 2];
                    boolean oneOrMore = (prevPatChar == '.' || prevPatChar == s.charAt(i - 1)) && dp[i - 1][j];
                    dp[i][j] = zeroOcc || oneOrMore;
                } else {
                    boolean matchChar = (pc == '.' || pc == s.charAt(i - 1));
                    dp[i][j] = matchChar && dp[i - 1][j - 1];
                }
            }
        }
        return dp[m][n];
    }
}
```

## Approach 2 — Rolling 1D array (space optimized)
**Idea.** Each row only needs the previous row (`dp[i-1][j]`) and current-row values already computed (`dp[i][j-2]`), so swap between two length-`(n+1)` arrays instead of a full grid.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public boolean isMatch(String s, String p) {
        int m = s.length(), n = p.length();
        boolean[] prev = new boolean[n + 1];
        boolean[] cur = new boolean[n + 1];
        prev[0] = true;
        for (int j = 1; j <= n; j++) {
            prev[j] = p.charAt(j - 1) == '*' && prev[j - 2];
        }

        for (int i = 1; i <= m; i++) {
            cur[0] = false;
            for (int j = 1; j <= n; j++) {
                char pc = p.charAt(j - 1);
                if (pc == '*') {
                    boolean zeroOcc = cur[j - 2];
                    char prevPatChar = p.charAt(j - 2);
                    boolean oneOrMore = (prevPatChar == '.' || prevPatChar == s.charAt(i - 1)) && prev[j];
                    cur[j] = zeroOcc || oneOrMore;
                } else {
                    boolean matchChar = (pc == '.' || pc == s.charAt(i - 1));
                    cur[j] = matchChar && prev[j - 1];
                }
            }
            boolean[] tmp = prev; prev = cur; cur = tmp;
        }
        return prev[n];
    }
}
```

## Key Takeaways
- `*` always refers to the character immediately before it in the pattern — treat the pair `(char, *)` as one atomic unit with two behaviors (skip it, or consume one `s` char and stay on the same pattern position).
- The base row (`dp[0][j]`) is essential for patterns that can match empty strings via trailing `x*` groups.
- Distinguish this from Wildcard Matching: here `*` is quantifier-like (tied to a preceding char), there `*` matches any substring independently.
