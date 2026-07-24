# Repeated Substring Pattern

**Difficulty:** Medium · **Pattern:** KMP LPS array — `n % (n - lps[n-1]) == 0` · [LeetCode](https://leetcode.com/problems/repeated-substring-pattern/)

## Problem
Given a string `s`, determine if it can be constructed by taking a substring of it and appending multiple copies of that substring together.

## Examples
**Example 1**
```
Input:  s = "abab"
Output: true
Explanation: "abab" is formed by repeating "ab" 2 times.
```

**Example 2**
```
Input:  s = "aba"
Output: false
```

## Constraints
- 1 <= s.length <= 10^4
- s consists of lowercase English letters only.

## Approach 1 — Try every divisor length
**Idea.** If `s` is built from repeating a block of length `L`, then `L` must divide `n = s.length()`. Try every `L` from 1 to `n/2` that divides `n`, and check whether repeating `s[0..L)` exactly `n/L` times reproduces `s`.
**Complexity.** Time O(n^2 / smallest divisor) — O(n^2) worst case, Space O(n).
```java
class Solution {
    public boolean repeatedSubstringPattern(String s) {
        int n = s.length();
        for (int len = 1; len <= n / 2; len++) {
            if (n % len != 0) continue;
            String block = s.substring(0, len);
            int reps = n / len;
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < reps; i++) sb.append(block);
            if (sb.toString().equals(s)) return true;
        }
        return false;
    }
}
```

## Approach 2 — KMP failure function (optimal)
**Idea.** Compute the LPS array of `s`. Let `k = lps[n-1]` be the length of the longest proper prefix of `s` that is also a suffix. The value `n - k` is the length of the smallest candidate "period" of the string. `s` is built from repeating a substring **if and only if** `k > 0` and `n - k` evenly divides `n`. Intuition: if `s` has period `p = n - k`, then shifting `s` left by `p` characters overlaps it with itself over the LPS-matched region, which is exactly what the LPS value certifies; and this period tiles `s` exactly when `p | n`.
**Complexity.** Time O(n), Space O(n).
```java
class Solution {
    public boolean repeatedSubstringPattern(String s) {
        int n = s.length();
        int[] lps = buildLPS(s);
        int k = lps[n - 1];
        int period = n - k;
        return k > 0 && n % period == 0;
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
- `n - lps[n-1]` is the string's smallest period; this single number answers "is this string periodic?" for free once the LPS array exists.
- Requiring `k > 0` rules out strings with no self-overlap (e.g., all-distinct characters), which trivially cannot be a repetition of a smaller block.
- The same `n - lps[n-1]` quantity reappears in problems about finding the minimal repeating unit or the number of characters to append to make a string periodic.
