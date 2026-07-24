# Wildcard Matching

**Difficulty:** Hard · **Pattern:** 2D boolean DP with `?` (any single char) and `*` (any sequence, including empty) · [LeetCode](https://leetcode.com/problems/wildcard-matching/)

## Problem
Given a string `s` and a pattern `p` containing `?` and `*`, implement wildcard matching over the entire string. `?` matches any single character; `*` matches any sequence of characters (including the empty sequence).

## Examples
**Example 1**
```
Input:  s = "adceb", p = "*a*b*"
Output: true
Explanation: '*' matches "" before 'a', "dce" between 'a' and 'b', and
"" after 'b'.
```

## Constraints
- `0 <= s.length <= 2000`, `0 <= p.length <= 2000`
- `p` contains only lowercase letters, `?`, and `*`.

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be true if `s[0..i)` matches `p[0..j)`. If `p[j-1]` is a literal character or `?`, it must align with `s[i-1]`: `dp[i][j] = dp[i-1][j-1] && (p[j-1]=='?' || p[j-1]==s[i-1])`. If `p[j-1] == '*'`, it can absorb zero characters (`dp[i][j-1]`) or absorb one more character of `s` while remaining the same `*` (`dp[i-1][j]`): `dp[i][j] = dp[i][j-1] || dp[i-1][j]`. Base row: `dp[0][j]` is true only while `p`'s prefix is all `*`.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public boolean isMatch(String s, String p) {
        int m = s.length(), n = p.length();
        boolean[][] dp = new boolean[m + 1][n + 1];
        dp[0][0] = true;
        for (int j = 1; j <= n; j++) {
            dp[0][j] = dp[0][j - 1] && p.charAt(j - 1) == '*';
        }

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                char pc = p.charAt(j - 1);
                if (pc == '*') {
                    dp[i][j] = dp[i][j - 1] || dp[i - 1][j];
                } else {
                    dp[i][j] = dp[i - 1][j - 1] && (pc == '?' || pc == s.charAt(i - 1));
                }
            }
        }
        return dp[m][n];
    }
}
```

## Approach 2 — Greedy two-pointer with backtracking (optimal / O(1) extra space)
**Idea.** Scan `s` and `p` with pointers `i, j`. On a literal/`?` match, advance both. On `*`, record its position and the current `i` as a fallback point, then optimistically advance `j` only (try matching zero characters first). On a mismatch, if a `*` was seen before, backtrack: retry the `*` by having it absorb one more character of `s` (increment the remembered `s` position and reset `j` just past the `*`). If no `*` is available to backtrack to, fail. At the end, any trailing `*`s in `p` still match the empty remainder.
**Complexity.** Time O(m·n) worst case, Space O(1) extra.
```java
class Solution {
    public boolean isMatch(String s, String p) {
        int i = 0, j = 0;
        int starIdx = -1, sMatch = 0;
        int m = s.length(), n = p.length();

        while (i < m) {
            if (j < n && (p.charAt(j) == '?' || p.charAt(j) == s.charAt(i))) {
                i++;
                j++;
            } else if (j < n && p.charAt(j) == '*') {
                starIdx = j;
                sMatch = i;
                j++;
            } else if (starIdx != -1) {
                j = starIdx + 1;
                sMatch++;
                i = sMatch;
            } else {
                return false;
            }
        }
        while (j < n && p.charAt(j) == '*') j++;
        return j == n;
    }
}
```

## Key Takeaways
- `*` here is a "match anything of any length" wildcard, independent of any specific preceding character — contrast with Regex `*`, which quantifies the immediately preceding token.
- The greedy pointer approach trades the DP's O(m·n) space for O(1) by remembering only the most recent `*` and retrying with a strictly increasing consumption count — a classic space optimization worth recognizing even if the DP is the "safer" first answer to write.
- Don't forget the trailing `while` loop to consume leftover `*` characters in the pattern after the main scan ends.
