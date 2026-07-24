# Edit Distance

**Difficulty:** Hard · **Pattern:** 2D string DP — minimum insert/delete/replace operations · [LeetCode](https://leetcode.com/problems/edit-distance/)

## Problem
Given two strings `word1` and `word2`, return the minimum number of single-character insertions, deletions, or substitutions needed to transform `word1` into `word2`.

## Examples
**Example 1**
```
Input:  word1 = "horse", word2 = "ros"
Output: 3
Explanation: horse -> rorse (replace h->r) -> rose (delete r) -> ros (delete e).
```

## Constraints
- `0 <= word1.length, word2.length <= 500`
- Lowercase English letters.

## Approach 1 — 2D DP table
**Idea.** Let `dp[i][j]` be the edit distance between `word1[0..i)` and `word2[0..j)`. Base cases: `dp[i][0] = i` (delete all), `dp[0][j] = j` (insert all). If `word1[i-1] == word2[j-1]`, no new operation is needed: `dp[i][j] = dp[i-1][j-1]`. Otherwise take the best of insert, delete, or replace: `dp[i][j] = 1 + min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1])`.
**Complexity.** Time O(m·n), Space O(m·n).
```java
class Solution {
    public int minDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    int replace = dp[i - 1][j - 1];
                    int delete = dp[i - 1][j];
                    int insert = dp[i][j - 1];
                    dp[i][j] = 1 + Math.min(replace, Math.min(delete, insert));
                }
            }
        }
        return dp[m][n];
    }
}
```

## Approach 2 — Rolling 1D array (space optimized)
**Idea.** Each cell depends only on the row above (`dp[i-1][j-1]`, `dp[i-1][j]`) and the current row's left neighbor (`dp[i][j-1]`), so a single array with a cached diagonal value is enough.
**Complexity.** Time O(m·n), Space O(n).
```java
class Solution {
    public int minDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[] dp = new int[n + 1];
        for (int j = 0; j <= n; j++) dp[j] = j;

        for (int i = 1; i <= m; i++) {
            int prevDiag = dp[0]; // dp[i-1][0]
            dp[0] = i;            // dp[i][0]
            for (int j = 1; j <= n; j++) {
                int temp = dp[j]; // dp[i-1][j] before overwrite
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[j] = prevDiag;
                } else {
                    dp[j] = 1 + Math.min(prevDiag, Math.min(dp[j], dp[j - 1]));
                }
                prevDiag = temp;
            }
        }
        return dp[n];
    }
}
```

## Key Takeaways
- Edit Distance is the canonical 3-way DP recurrence (insert/delete/replace) — memorize it, it recurs in many string-alignment problems.
- The diagonal value (`dp[i-1][j-1]`) must be cached in a temp variable *before* the current cell overwrites the array in the space-optimized version.
- Base row/column (`dp[i][0] = i`, `dp[0][j] = j`) represent "transform by pure insertion/deletion" — always sanity-check these first.
