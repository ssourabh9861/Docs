# Longest Common Subsequence

**Difficulty:** Medium · **Pattern:** 2D string DP — match/skip recurrence on two sequences · [LeetCode](https://leetcode.com/problems/longest-common-subsequence/)

## Problem
Given two strings `text1` and `text2`, return the length of their longest common subsequence (not necessarily contiguous, order preserved), or `0` if none exists.

## Examples
**Example 1**
```
Input:  text1 = "abcde", text2 = "ace"
Output: 3
Explanation: "ace" is the longest common subsequence.
```

## Constraints
- `1 <= text1.length, text2.length <= 1000`
- Lowercase/uppercase English letters.

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be the LCS length of `text1[0..i)` and `text2[0..j)`. If the last characters match, extend the best subsequence found without them: `dp[i][j] = dp[i-1][j-1] + 1`. Otherwise take the best of dropping a character from either string: `dp[i][j] = max(dp[i-1][j], dp[i][j-1])`.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int longestCommonSubsequence(String text1, String text2) {
        int m = text1.length(), n = text2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m][n];
    }
}
```

## Approach 2 — Rolling 1D array with cached diagonal (space optimized)
**Idea.** Same dependency shape as Edit Distance — only the row above and the current row's left neighbor matter, so cache the diagonal in a temp variable while sweeping a single array left to right.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public int longestCommonSubsequence(String text1, String text2) {
        int m = text1.length(), n = text2.length();
        int[] dp = new int[n + 1];
        for (int i = 1; i <= m; i++) {
            int prevDiag = 0; // dp[i-1][0] is always 0
            for (int j = 1; j <= n; j++) {
                int temp = dp[j]; // dp[i-1][j] before overwrite
                if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                    dp[j] = prevDiag + 1;
                } else {
                    dp[j] = Math.max(dp[j], dp[j - 1]);
                }
                prevDiag = temp;
            }
        }
        return dp[n];
    }
}
```

## Key Takeaways
- LCS is the base pattern behind Edit Distance, Shortest Common Supersequence, and Longest Palindromic Subsequence (via LCS with the reverse) — master this recurrence once.
- "Characters match" always tries to extend the diagonal; "characters differ" always tries dropping one character from either side, never both.
- The 1D-with-diagonal trick generalizes to any 2D DP whose transitions only touch `(i-1,j-1)`, `(i-1,j)`, `(i,j-1)`.
