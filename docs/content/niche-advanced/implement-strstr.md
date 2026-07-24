# Implement strStr()

**Difficulty:** Medium · **Pattern:** String matching — KMP failure function · [LeetCode](https://leetcode.com/problems/implement-strstr/)

## Problem
Given a haystack string and a needle string, return the index of the first occurrence of needle in haystack, or -1 if needle does not occur in haystack. (LeetCode now hosts this as "Find the Index of the First Occurrence in a String".)

## Examples
**Example 1**
```
Input:  haystack = "sadbutsad", needle = "sad"
Output: 0
Explanation: "sad" occurs at index 0 and 6, the first occurrence is at index 0.
```

**Example 2**
```
Input:  haystack = "leetcode", needle = "leeto"
Output: -1
Explanation: "leeto" did not occur in "leetcode".
```

## Constraints
- 1 <= haystack.length, needle.length <= 10^4
- haystack and needle consist of only lowercase English characters.

## Approach 1 — Brute force sliding comparison
**Idea.** Try every starting index `i` in haystack and compare characters against needle one by one, bailing out on the first mismatch. This is the natural approach but degrades badly on adversarial inputs like `haystack = "aaaa...a"`, `needle = "aaaa...ab"`.
**Complexity.** Time O(n·m), Space O(1).
```java
class Solution {
    public int strStr(String haystack, String needle) {
        int n = haystack.length(), m = needle.length();
        for (int i = 0; i + m <= n; i++) {
            int j = 0;
            while (j < m && haystack.charAt(i + j) == needle.charAt(j)) j++;
            if (j == m) return i;
        }
        return -1;
    }
}
```

## Approach 2 — Knuth-Morris-Pratt (optimal)
**Idea.** Precompute the **LPS array** (Longest proper Prefix that is also a Suffix) for `needle`. `lps[i]` is the length of the longest proper prefix of `needle[0..i]` that also matches a suffix ending at `i`. While scanning haystack, whenever a mismatch occurs after having matched `j` characters, instead of restarting from scratch we jump `j` back to `lps[j-1]` — the longest prefix we already know matches — and keep comparing. Each character of haystack is examined a bounded number of times because the fallback strictly shrinks `j`, giving linear time overall.

Building the LPS array itself uses the same two-pointer idea applied to `needle` against itself.
**Complexity.** Time O(n + m), Space O(m) for the LPS array.
```java
class Solution {
    public int strStr(String haystack, String needle) {
        int n = haystack.length(), m = needle.length();
        if (m == 0) return 0;
        int[] lps = buildLPS(needle);

        int i = 0, j = 0; // i -> haystack, j -> needle
        while (i < n) {
            if (haystack.charAt(i) == needle.charAt(j)) {
                i++; j++;
                if (j == m) return i - j; // full match found
            } else if (j > 0) {
                j = lps[j - 1]; // fall back using failure function, don't move i
            } else {
                i++; // no match at all, advance haystack pointer
            }
        }
        return -1;
    }

    // lps[i] = length of the longest proper prefix of needle[0..i]
    //          that is also a suffix of needle[0..i]
    private int[] buildLPS(String needle) {
        int m = needle.length();
        int[] lps = new int[m];
        int len = 0; // length of the previous longest prefix-suffix
        int i = 1;
        while (i < m) {
            if (needle.charAt(i) == needle.charAt(len)) {
                lps[i++] = ++len;
            } else if (len > 0) {
                len = lps[len - 1]; // fall back within the pattern itself
            } else {
                lps[i++] = 0;
            }
        }
        return lps;
    }
}
```

## Key Takeaways
- The LPS array is the core reusable building block for the entire KMP family of problems — it says "if I fail here, how far back can I safely rewind without re-checking characters I already know match?"
- KMP never backtracks the haystack pointer `i`, only the pattern pointer `j`, which is what makes it linear.
- Once you can build an LPS array, `strStr`, Shortest Palindrome, Repeated Substring Pattern, and Longest Happy Prefix are all thin wrappers around it.
