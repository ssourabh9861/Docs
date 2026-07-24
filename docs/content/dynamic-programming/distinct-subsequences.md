# Distinct Subsequences

**Difficulty:** Hard · **Pattern:** 2D counting DP — number of ways `t` appears as a subsequence of `s` · [LeetCode](https://leetcode.com/problems/distinct-subsequences/)

## Problem
Given strings `s` and `t`, count the number of distinct subsequences of `s` that equal `t`.

## Examples
**Example 1**
```
Input:  s = "rabbbit", t = "rabbit"
Output: 3
Explanation: Three different choices of which 'b' to drop from "rabbbit"
all yield "rabbit".
```

## Constraints
- `1 <= s.length, t.length <= 1000`
- Lowercase English letters.

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be the number of ways `t[0..j)` appears as a subsequence of `s[0..i)`. Base case: `dp[i][0] = 1` for all `i` (the empty string is always a subsequence, exactly one way). Transition: `dp[i][j] = dp[i-1][j]` (skip `s[i-1]`) `+ dp[i-1][j-1]` if `s[i-1] == t[j-1]` (also use `s[i-1]` to match `t[j-1]`).
**Complexity.** Time O(m·n), Space O(m·n) (using `long` to stay safe, though values fit in `int` per constraints).
```java
class Solution {
    public int numDistinct(String s, String t) {
        int m = s.length(), n = t.length();
        long[][] dp = new long[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = 1;

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                dp[i][j] = dp[i - 1][j];
                if (s.charAt(i - 1) == t.charAt(j - 1)) {
                    dp[i][j] += dp[i - 1][j - 1];
                }
            }
        }
        return (int) dp[m][n];
    }
}
```

## Approach 2 — Rolling 1D array, iterated right to left (space optimized)
**Idea.** Row `i` only needs row `i-1`'s values. Iterating `j` from high to low lets a single array serve as both "previous row" (for indices not yet touched this pass) and "current row" (for indices already updated), without needing a diagonal cache.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public int numDistinct(String s, String t) {
        int m = s.length(), n = t.length();
        long[] dp = new long[n + 1];
        dp[0] = 1;

        for (int i = 1; i <= m; i++) {
            for (int j = n; j >= 1; j--) {
                if (s.charAt(i - 1) == t.charAt(j - 1)) {
                    dp[j] += dp[j - 1];
                }
                // else dp[j] unchanged, matching dp[i][j] = dp[i-1][j]
            }
        }
        return (int) dp[n];
    }
}
```

## Key Takeaways
- This is a *counting* DP, not optimization: sum contributions instead of taking `max`/`min`.
- `dp[i][0] = 1` (not 0) is the subtlety most solutions get wrong first — the empty target subsequence has exactly one match.
- Iterating `j` right-to-left in the 1D version is required here (unlike the LCS-style left-to-right sweep) because `dp[j]` must still hold the *previous row's* value when `dp[j-1]` is read.
