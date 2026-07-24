# Interleaving String

**Difficulty:** Hard · **Pattern:** 2D boolean DP — can two strings interleave to form a third? · [LeetCode](https://leetcode.com/problems/interleaving-string/)

## Problem
Given strings `s1`, `s2`, and `s3`, determine whether `s3` can be formed by interleaving `s1` and `s2` (preserving the relative order of characters within each of `s1` and `s2`).

## Examples
**Example 1**
```
Input:  s1 = "aabcc", s2 = "dbbca", s3 = "aadbbcbcac"
Output: true
Explanation: Interleave characters from s1 and s2 while keeping each
string's internal order to reconstruct s3.
```

## Constraints
- `0 <= s1.length, s2.length <= 100`
- `s1.length + s2.length == s3.length`

## Approach 1 — 2D boolean DP table
**Idea.** Let `dp[i][j]` be true if `s3[0..i+j)` can be formed by interleaving `s1[0..i)` and `s2[0..j)`. `dp[0][0] = true`. `dp[i][j]` is true if either: `dp[i-1][j]` is true and `s1[i-1] == s3[i+j-1]` (the last character of `s3` came from `s1`), or `dp[i][j-1]` is true and `s2[j-1] == s3[i+j-1]` (it came from `s2`). First check total length equality as a quick reject.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public boolean isInterleave(String s1, String s2, String s3) {
        int m = s1.length(), n = s2.length();
        if (m + n != s3.length()) return false;

        boolean[][] dp = new boolean[m + 1][n + 1];
        dp[0][0] = true;
        for (int i = 1; i <= m; i++) {
            dp[i][0] = dp[i - 1][0] && s1.charAt(i - 1) == s3.charAt(i - 1);
        }
        for (int j = 1; j <= n; j++) {
            dp[0][j] = dp[0][j - 1] && s2.charAt(j - 1) == s3.charAt(j - 1);
        }

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                char target = s3.charAt(i + j - 1);
                boolean fromS1 = dp[i - 1][j] && s1.charAt(i - 1) == target;
                boolean fromS2 = dp[i][j - 1] && s2.charAt(j - 1) == target;
                dp[i][j] = fromS1 || fromS2;
            }
        }
        return dp[m][n];
    }
}
```

## Approach 2 — Rolling 1D boolean array (space optimized)
**Idea.** Row `i` only depends on row `i-1` (same column) and the current row's left neighbor, so a single boolean array swept left to right suffices.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public boolean isInterleave(String s1, String s2, String s3) {
        int m = s1.length(), n = s2.length();
        if (m + n != s3.length()) return false;

        boolean[] dp = new boolean[n + 1];
        dp[0] = true;
        for (int j = 1; j <= n; j++) {
            dp[j] = dp[j - 1] && s2.charAt(j - 1) == s3.charAt(j - 1);
        }

        for (int i = 1; i <= m; i++) {
            dp[0] = dp[0] && s1.charAt(i - 1) == s3.charAt(i - 1);
            for (int j = 1; j <= n; j++) {
                char target = s3.charAt(i + j - 1);
                boolean fromS1 = dp[j] && s1.charAt(i - 1) == target;   // dp[i-1][j] before overwrite
                boolean fromS2 = dp[j - 1] && s2.charAt(j - 1) == target; // dp[i][j-1], already updated
                dp[j] = fromS1 || fromS2;
            }
        }
        return dp[n];
    }
}
```

## Key Takeaways
- The length check `m + n == s3.length()` is a mandatory O(1) pre-filter before the DP even starts.
- `dp[i][j]` is an OR of two boolean possibilities, not a max/count — once true, never re-derive.
- The 1D version works left-to-right (unlike Distinct Subsequences) because both source dependencies (`dp[i-1][j]` and `dp[i][j-1]`) are still valid reads at the moment `dp[j]` is computed.
