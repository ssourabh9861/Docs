# Palindrome Partitioning II

**Difficulty:** Hard · **Pattern:** Min-cut interval DP over a precomputed palindrome table · [LeetCode](https://leetcode.com/problems/palindrome-partitioning-ii/)

## Problem
Given a string `s`, partition it so every substring of the partition is a palindrome. Return the minimum number of cuts needed to achieve such a partition.

## Examples
**Example 1**
```
Input:  s = "aab"
Output: 1
Explanation: One cut gives the palindrome partition ["aa","b"].
```
**Example 2**
```
Input:  s = "a"
Output: 0
```

## Constraints
- `1 <= s.length <= 2000`
- `s` consists of lowercase English letters only.

## Approach 1 — Recompute palindrome checks on the fly
**Idea.** Let `cuts[i]` be the minimum cuts needed for the prefix `s[0..i]`. For each `i`, try every `j <= i` as the start of the last palindromic piece: if `s[j..i]` is a palindrome, `cuts[i] = min(cuts[i], (j == 0 ? 0 : cuts[j-1] + 1))`. Checking whether `s[j..i]` is a palindrome by direct two-pointer comparison each time costs O(n) per check.
**Complexity.** Time O(n³), Space O(n).
```java
class Solution {
    public int minCut(String s) {
        int n = s.length();
        int[] cuts = new int[n];
        for (int i = 0; i < n; i++) {
            int best = i; // worst case: cut before every character
            for (int j = 0; j <= i; j++) {
                if (isPalindrome(s, j, i)) {
                    best = Math.min(best, j == 0 ? 0 : cuts[j - 1] + 1);
                }
            }
            cuts[i] = best;
        }
        return cuts[n - 1];
    }

    private boolean isPalindrome(String s, int lo, int hi) {
        while (lo < hi) {
            if (s.charAt(lo++) != s.charAt(hi--)) return false;
        }
        return true;
    }
}
```

## Approach 2 — Precomputed palindrome table (optimal)
**Idea.** First build `isPal[i][j]` for all substrings in O(n²) using the standard palindrome-table recurrence (`isPal[i][j] = s[i]==s[j] && isPal[i+1][j-1]`). Then compute `cuts[i]` exactly as above, but each palindrome check becomes an O(1) table lookup instead of an O(n) scan, dropping the total to O(n²).
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    public int minCut(String s) {
        int n = s.length();
        boolean[][] isPal = new boolean[n][n];
        for (int len = 1; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) == s.charAt(j) && (len <= 2 || isPal[i + 1][j - 1])) {
                    isPal[i][j] = true;
                }
            }
        }

        int[] cuts = new int[n];
        for (int i = 0; i < n; i++) {
            if (isPal[0][i]) {
                cuts[i] = 0;
                continue;
            }
            int best = i;
            for (int j = 1; j <= i; j++) {
                if (isPal[j][i]) {
                    best = Math.min(best, cuts[j - 1] + 1);
                }
            }
            cuts[i] = best;
        }
        return cuts[n - 1];
    }
}
```

## Key Takeaways
- Precomputing the palindrome table converts an O(n) inner check into O(1), which is the single change that drops overall complexity from O(n³) to O(n²).
- `cuts[i]` is a 1D prefix DP layered on top of the 2D palindrome table — a common two-layer DP structure.
- The same `isPal` table is reused verbatim in full palindrome-partitioning enumeration (LeetCode 131) and in palindromic-substring counting.
