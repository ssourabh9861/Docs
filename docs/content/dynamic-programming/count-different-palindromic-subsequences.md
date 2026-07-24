# Count Different Palindromic Subsequences

**Difficulty:** Very Hard · **Pattern:** Interval DP counting distinct subsequences via next/prev occurrence pointers · [LeetCode](https://leetcode.com/problems/count-different-palindromic-subsequences/)

## Problem
Given a string `s`, return the number of *distinct* non-empty palindromic subsequences in `s`, modulo `1e9 + 7`. Two subsequences are distinct if the resulting sequence of characters differs, regardless of which indices produced them.

## Examples
**Example 1**
```
Input:  s = "bccb"
Output: 6
Explanation: Distinct palindromic subsequences: 'b','c','bb','cc','bcb','bccb'.
```
**Example 2**
```
Input:  s = "abcdabcdabcdabcdabcdabcdabcdabcddcbadcbadcbadcbadcbadcbadcbadcba"
Output: 104860361
Explanation: Answer taken modulo 1e9 + 7.
```

## Constraints
- `1 <= s.length <= 1000`
- `s[i]` is one of `'a'`, `'b'`, `'c'`, `'d'`.

## Approach 1 — Memoized recursion with a linear scan for boundaries
**Idea.** Let `dp[i][j]` be the count of distinct palindromic subsequences in `s[i..j]`. If `s[i] != s[j]`, the palindromes of `[i,j]` are exactly the union of those in `[i+1,j]` and `[i,j-1]`, counted once via inclusion–exclusion: `dp[i][j] = dp[i+1][j] + dp[i][j-1] - dp[i+1][j-1]`. If `s[i] == s[j] == c`, every palindrome of `[i+1][j-1]` can be wrapped in `c` on both sides to form a new distinct palindrome, plus `c` and `cc` themselves — but we must avoid double counting depending on how many more `c`s sit strictly inside: find `low` (first `c` after `i`) and `high` (last `c` before `j`) by scanning. If none exists, `dp[i][j] = 2*dp[i+1][j-1] + 2`; if exactly one, `dp[i][j] = 2*dp[i+1][j-1] + 1`; if more than one, `dp[i][j] = 2*dp[i+1][j-1] - dp[low+1][high-1]`. All values are taken mod `1e9+7`, guarding against negatives.
**Complexity.** Time O(n³) (the boundary scan costs O(n) per state), Space O(n²).
```java
class Solution {
    private static final int MOD = 1_000_000_007;
    private int[][] memo;
    private int[] valOrNull; // sentinel not needed; using -1 as "uncomputed"
    private String s;

    public int countPalindromicSubsequences(String s) {
        this.s = s;
        int n = s.length();
        memo = new int[n][n];
        for (int[] row : memo) Arrays.fill(row, -1);
        return solve(0, n - 1);
    }

    private int solve(int i, int j) {
        if (i > j) return 0;
        if (i == j) return 1;
        if (memo[i][j] != -1) return memo[i][j];

        long result;
        if (s.charAt(i) != s.charAt(j)) {
            result = solve(i + 1, j) + solve(i, j - 1) - solve(i + 1, j - 1);
        } else {
            char c = s.charAt(i);
            int low = i + 1, high = j - 1;
            while (low <= high && s.charAt(low) != c) low++;
            while (low <= high && s.charAt(high) != c) high--;
            if (low > high) {
                result = 2L * solve(i + 1, j - 1) + 2;
            } else if (low == high) {
                result = 2L * solve(i + 1, j - 1) + 1;
            } else {
                result = 2L * solve(i + 1, j - 1) - solve(low + 1, high - 1);
            }
        }
        result = ((result % MOD) + MOD) % MOD;
        return memo[i][j] = (int) result;
    }
}
```
*(add `import java.util.Arrays;`)*

## Approach 2 — Bottom-up with precomputed next/prev occurrence tables (optimal)
**Idea.** Precompute, for every position and every character `c` in `{a,b,c,d}`, the nearest occurrence of `c` at or after each index (`next[c][i]`) and at or before each index (`prev[c][i]`). This turns the O(n) `low`/`high` scan into O(1) lookups, dropping the total to O(n²). Fill `dp` bottom-up by increasing interval length.
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int countPalindromicSubsequences(String s) {
        int n = s.length();
        int[][] next = new int[4][n + 1];
        int[][] prev = new int[4][n + 1];
        for (int c = 0; c < 4; c++) {
            next[c][n] = -1;
            for (int i = n - 1; i >= 0; i--) {
                next[c][i] = (s.charAt(i) - 'a' == c) ? i : next[c][i + 1];
            }
            prev[c][0] = -1;
            for (int i = 1; i <= n; i++) {
                prev[c][i] = (s.charAt(i - 1) - 'a' == c) ? i - 1 : prev[c][i - 1];
            }
        }

        long[][] dp = new long[n][n];
        for (int i = 0; i < n; i++) dp[i][i] = 1;

        for (int len = 2; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) != s.charAt(j)) {
                    dp[i][j] = dp[i + 1][j] + dp[i][j - 1] - dp[i + 1][j - 1];
                } else {
                    int c = s.charAt(i) - 'a';
                    int low = next[c][i + 1];  // first occurrence of c at index >= i+1
                    int high = prev[c][j];     // last occurrence of c at index < j
                    if (low == j) {
                        // no c strictly between i and j
                        dp[i][j] = 2 * dp[i + 1][j - 1] + 2;
                    } else if (low == high) {
                        // exactly one c strictly between i and j
                        dp[i][j] = 2 * dp[i + 1][j - 1] + 1;
                    } else {
                        // two or more c's strictly between i and j
                        dp[i][j] = 2 * dp[i + 1][j - 1] - dp[low + 1][high - 1];
                    }
                }
                dp[i][j] = ((dp[i][j] % MOD) + MOD) % MOD;
            }
        }
        return (int) dp[0][n - 1];
    }
}
```

## Key Takeaways
- The three-case split (`no inner match / one inner match / multiple inner matches`) is what prevents overcounting when both ends of an interval share a character.
- Precomputing next/prev occurrence tables per character is the standard trick to shave an O(n) scan down to O(1) inside an O(n²) interval DP.
- Always normalize modulo results with `((x % MOD) + MOD) % MOD` since the inclusion–exclusion terms can go negative.
