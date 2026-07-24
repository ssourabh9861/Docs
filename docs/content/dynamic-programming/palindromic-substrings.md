# Palindromic Substrings

**Difficulty:** Medium · **Pattern:** Expand around center / interval DP on palindrome table · [LeetCode](https://leetcode.com/problems/palindromic-substrings/)

## Problem
Given a string `s`, count how many contiguous substrings of `s` are palindromes. Different positions count separately even if the substrings are equal in content.

## Examples
**Example 1**
```
Input:  s = "abc"
Output: 3
Explanation: "a", "b", "c" are the only palindromic substrings.
```
**Example 2**
```
Input:  s = "aaa"
Output: 6
Explanation: "a","a","a","aa","aa","aaa" — 6 palindromic substrings (including overlaps).
```

## Constraints
- `1 <= s.length <= 1000`
- `s` consists of lowercase English letters.

## Approach 1 — Interval DP on a palindrome table
**Idea.** Let `dp[i][j]` be true iff `s[i..j]` (inclusive) is a palindrome. Base cases: every single character is a palindrome (`dp[i][i] = true`), and two equal adjacent characters form a palindrome (`dp[i][i+1] = (s[i]==s[i+1])`). For longer ranges, `dp[i][j] = (s[i]==s[j]) && dp[i+1][j-1]`. Fill by increasing substring length and count every `true` cell.
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    public int countSubstrings(String s) {
        int n = s.length();
        boolean[][] dp = new boolean[n][n];
        int count = 0;
        for (int len = 1; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) == s.charAt(j) && (len <= 2 || dp[i + 1][j - 1])) {
                    dp[i][j] = true;
                    count++;
                }
            }
        }
        return count;
    }
}
```

## Approach 2 — Expand around center (optimal)
**Idea.** Every palindrome has a center — either a single character (odd length) or a gap between two characters (even length). There are `2n - 1` such centers. For each center, expand outward while the two sides match, counting one palindrome per successful expansion. This avoids storing the full `dp` table.
**Complexity.** Time O(n²), Space O(1).
```java
class Solution {
    public int countSubstrings(String s) {
        int n = s.length();
        int count = 0;
        for (int center = 0; center < 2 * n - 1; center++) {
            int left = center / 2;
            int right = left + center % 2;
            while (left >= 0 && right < n && s.charAt(left) == s.charAt(right)) {
                count++;
                left--;
                right++;
            }
        }
        return count;
    }
}
```

## Key Takeaways
- Interval DP (`dp[i][j]` on palindrome-ness) is the natural mental model but costs O(n²) space.
- Expand-around-center reaches the same O(n²) time with O(1) space by exploiting the center-symmetry of palindromes.
- The same center-expansion trick underlies Manacher's O(n) algorithm if you need to go further.
