# Longest Happy Prefix

**Difficulty:** Hard · **Pattern:** KMP LPS array of the full string · [LeetCode](https://leetcode.com/problems/longest-happy-prefix/)

## Problem
A "happy prefix" of a string is a non-empty prefix that is also a suffix, excluding the string itself. Given `s`, return its longest happy prefix, or `""` if none exists.

## Examples
**Example 1**
```
Input:  s = "level"
Output: "l"
Explanation: "l" is a proper prefix and suffix; longer candidates ("le", "lev"...) don't work except the trivial full string, which is excluded.
```

**Example 2**
```
Input:  s = "ababab"
Output: "abab"
Explanation: "abab" is a prefix of "ababab" and also its suffix.
```

## Constraints
- 1 <= s.length <= 10^5
- s consists of lowercase English letters only.

## Approach 1 — Brute force prefix/suffix comparison
**Idea.** For each candidate length `L` from `n-1` down to 1, compare `s[0..L)` against `s[n-L..n)` character by character; return the first match found (which is the longest since we scan from `n-1` downward).
**Complexity.** Time O(n^2), Space O(1) extra (ignoring the output string).
```java
class Solution {
    public String longestPrefix(String s) {
        int n = s.length();
        for (int len = n - 1; len >= 1; len--) {
            if (s.regionMatches(0, s, n - len, len)) {
                return s.substring(0, len);
            }
        }
        return "";
    }
}
```

## Approach 2 — KMP failure function on the whole string (optimal)
**Idea.** This is literally the definition of the LPS array: `lps[n-1]` is exactly the length of the longest proper prefix of `s` that is also a proper suffix of `s` — the longest happy prefix, by construction. No separator or concatenation trick is even needed here (unlike Shortest Palindrome), because we're matching `s` against itself directly, which is precisely what LPS computes.
**Complexity.** Time O(n), Space O(n).
```java
class Solution {
    public String longestPrefix(String s) {
        int n = s.length();
        int[] lps = buildLPS(s);
        int len = lps[n - 1];
        return s.substring(0, len);
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
- "Longest Happy Prefix" is the textbook definition of what `lps[n-1]` computes — recognizing this collapses the problem to a single LPS build.
- No string concatenation trick is needed since we're comparing `s` to itself, not to its reverse.
- Contrast with Shortest Palindrome (needs `s + '#' + reverse(s)`) and Repeated Substring Pattern (needs `n % (n - lps[n-1])`) — all three reuse the same LPS array but read a different fact off of it.
