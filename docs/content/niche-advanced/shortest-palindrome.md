# Shortest Palindrome

**Difficulty:** Hard · **Pattern:** KMP failure function on `s + separator + reverse(s)` · [LeetCode](https://leetcode.com/problems/shortest-palindrome/)

## Problem
Given a string `s`, you may only add characters in front of it to make it a palindrome. Return the shortest possible palindrome you can find by performing this transformation.

## Examples
**Example 1**
```
Input:  s = "aacecaaa"
Output: "aaacecaaa"
Explanation: Prepending a single 'a' makes the whole string a palindrome.
```

**Example 2**
```
Input:  s = "abcd"
Output: "dcbabcd"
Explanation: The longest palindromic prefix of "abcd" is "a"; we prepend the reverse of the remaining suffix "bcd" -> "dcb".
```

## Constraints
- 0 <= s.length <= 5 * 10^4
- s consists of lowercase English letters only.

## Approach 1 — Brute force with `String.startsWith`
**Idea.** The answer is determined by the **longest prefix of `s` that is itself a palindrome**. If we know that prefix has length `L`, the remaining suffix `s[L..n)` (reversed) is exactly what must be prepended. Find `L` by checking, from longest to shortest, whether `s[0..k)` reads the same forwards and backwards.
**Complexity.** Time O(n^2) in the worst case (checking each candidate prefix costs O(n)), Space O(n).
```java
class Solution {
    public String shortestPalindrome(String s) {
        int n = s.length();
        for (int end = n; end > 0; end--) {
            if (isPalindrome(s, 0, end - 1)) {
                String suffix = s.substring(end);
                return new StringBuilder(suffix).reverse().toString() + s;
            }
        }
        return s;
    }

    private boolean isPalindrome(String s, int lo, int hi) {
        while (lo < hi) {
            if (s.charAt(lo++) != s.charAt(hi--)) return false;
        }
        return true;
    }
}
```

## Approach 2 — KMP failure function on `s + '#' + reverse(s)` (optimal)
**Idea.** We need the length of the longest prefix of `s` that equals a suffix of `reverse(s)` — because a prefix of `s` that is a palindrome is, by definition, equal to its own reverse, and a reversed palindrome read from the end of `reverse(s)` lines up with the start of `s`. Build the combined string:

```
combined = s + '#' + reverse(s)
```

The separator `#` (a character not in the alphabet) prevents the LPS computation from "overshooting" across the boundary between the two halves. Compute the LPS array of `combined`; the last entry, `lps[combined.length()-1]`, is exactly the length of the longest palindromic **prefix** of `s`. Everything after that prefix in `s`, reversed, is what we prepend.
**Complexity.** Time O(n), Space O(n).
```java
class Solution {
    public String shortestPalindrome(String s) {
        int n = s.length();
        if (n == 0) return s;

        String rev = new StringBuilder(s).reverse().toString();
        String combined = s + "#" + rev;
        int[] lps = buildLPS(combined);

        int palindromicPrefixLen = lps[combined.length() - 1];
        String suffixToPrepend = s.substring(palindromicPrefixLen);
        return new StringBuilder(suffixToPrepend).reverse().toString() + s;
    }

    private int[] buildLPS(String p) {
        int m = p.length();
        int[] lps = new int[m];
        int len = 0, i = 1;
        while (i < m) {
            if (p.charAt(i) == p.charAt(len)) {
                lps[i++] = ++len;
            } else if (len > 0) {
                len = lps[len - 1];
            } else {
                lps[i++] = 0;
            }
        }
        return lps;
    }
}
```

## Key Takeaways
- The trick "concatenate `s`, a separator, and `reverse(s)`, then read `lps[last]`" is a standard technique for finding the longest palindromic **prefix** (or suffix, symmetrically) in linear time.
- The separator is essential — without it the LPS value could exceed `n` and wrongly overlap the two halves.
- Once the longest palindromic prefix is known, the construction of the final answer is O(n) string work.
