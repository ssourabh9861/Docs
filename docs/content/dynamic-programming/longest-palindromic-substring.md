# Longest Palindromic Substring

**Difficulty:** Medium · **Pattern:** Expand around center / interval DP on palindrome table · [LeetCode](https://leetcode.com/problems/longest-palindromic-substring/)

## Problem
Given a string `s`, return the longest substring of `s` that is a palindrome.

## Examples
**Example 1**
```
Input:  s = "babad"
Output: "bab"
Explanation: "aba" is also a valid answer of the same length.
```
**Example 2**
```
Input:  s = "cbbd"
Output: "bb"
```

## Constraints
- `1 <= s.length <= 1000`
- `s` consists of digits and English letters.

## Approach 1 — Interval DP on a palindrome table
**Idea.** `dp[i][j]` is true iff `s[i..j]` is a palindrome, with base cases `dp[i][i] = true` and `dp[i][i+1] = (s[i]==s[i+1])`. For `len >= 3`, `dp[i][j] = (s[i]==s[j]) && dp[i+1][j-1]`. Fill by increasing length and track the longest `true` interval seen.
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    public String longestPalindrome(String s) {
        int n = s.length();
        boolean[][] dp = new boolean[n][n];
        int bestLen = 1, bestStart = 0;
        for (int i = 0; i < n; i++) dp[i][i] = true;
        for (int len = 2; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) == s.charAt(j) && (len == 2 || dp[i + 1][j - 1])) {
                    dp[i][j] = true;
                    if (len > bestLen) {
                        bestLen = len;
                        bestStart = i;
                    }
                }
            }
        }
        return s.substring(bestStart, bestStart + bestLen);
    }
}
```

## Approach 2 — Expand around center (optimal)
**Idea.** For each of the `2n - 1` possible centers (character or gap), expand outward while both ends match, recording the widest expansion. Keep the best `(start, end)` pair found across all centers. No table is needed.
**Complexity.** Time O(n²), Space O(1).
```java
class Solution {
    public String longestPalindrome(String s) {
        if (s == null || s.length() < 1) return "";
        int start = 0, end = 0;
        for (int center = 0; center < 2 * s.length() - 1; center++) {
            int left = center / 2;
            int right = left + center % 2;
            while (left >= 0 && right < s.length() && s.charAt(left) == s.charAt(right)) {
                left--;
                right++;
            }
            // after the loop, the valid palindrome is (left+1, right-1)
            if (right - 1 - (left + 1) > end - start) {
                start = left + 1;
                end = right - 1;
            }
        }
        return s.substring(start, end + 1);
    }
}
```

## Key Takeaways
- The palindrome table from Approach 1 is reusable across many palindrome DP problems (partitioning, counting) — worth memorizing.
- Expand-around-center trades table storage for two passes per center, giving O(1) extra space at the same O(n²) time.
- Manacher's algorithm pushes this to true O(n) by reusing previously computed palindrome radii, but is rarely required for interview-level constraints (n ≤ 1000).
