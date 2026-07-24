# Find All Anagrams in a String

**Difficulty:** Medium · **Pattern:** Fixed-size sliding window with character-count comparison · [LeetCode](https://leetcode.com/problems/find-all-anagrams-in-a-string/)

## Problem
Given two strings `s` and `p`, return an array of all the start indices of `p`'s anagrams in `s`. The order of the output does not matter.

## Examples
**Example 1**
```
Input:  s = "cbaebabacd", p = "abc"
Output: [0, 6]
Explanation: substring starting at 0 is "cba" (anagram of "abc"); at 6 is "bac" (anagram of "abc").
```

**Example 2**
```
Input:  s = "abab", p = "ab"
Output: [0, 1, 2]
```

## Constraints
- 1 <= s.length, p.length <= 3 * 10^4
- s and p consist of lowercase English letters.

## Approach 1 — Sort-and-compare every window
**Idea.** For each window of length `|p|` in `s`, sort the window's characters and compare to the sorted form of `p`. Correct but wasteful since re-sorting each window ignores the fact that consecutive windows differ by only one character.
**Complexity.** Time O(n·m log m), Space O(m).
```java
import java.util.*;

class Solution {
    public List<Integer> findAnagrams(String s, String p) {
        List<Integer> result = new ArrayList<>();
        int n = s.length(), m = p.length();
        if (m > n) return result;
        char[] sortedP = p.toCharArray();
        Arrays.sort(sortedP);
        String target = new String(sortedP);

        for (int i = 0; i + m <= n; i++) {
            char[] window = s.substring(i, i + m).toCharArray();
            Arrays.sort(window);
            if (new String(window).equals(target)) result.add(i);
        }
        return result;
    }
}
```

## Approach 2 — Fixed-size sliding window with count arrays (optimal)
**Idea.** Maintain two length-26 frequency arrays: `need` for `p` (fixed) and `window` for the current substring of `s` of length `|p|`. Slide the window one character at a time: add the incoming character's count, remove the outgoing character's count once the window exceeds size `m`, and compare `window` to `need`. Instead of comparing full 26-length arrays every time (which would cost O(26) per position), track a single integer `matches` — the number of character slots where the counts currently agree — and update it incrementally so each slide is O(1) amortized.
**Complexity.** Time O(n), Space O(1) (26-letter alphabet).
```java
import java.util.*;

class Solution {
    public List<Integer> findAnagrams(String s, String p) {
        List<Integer> result = new ArrayList<>();
        int n = s.length(), m = p.length();
        if (m > n) return result;

        int[] need = new int[26];
        int[] window = new int[26];
        for (char c : p.toCharArray()) need[c - 'a']++;

        for (int i = 0; i < n; i++) {
            window[s.charAt(i) - 'a']++;
            if (i >= m) {
                window[s.charAt(i - m) - 'a']--; // drop the char leaving the window
            }
            if (i >= m - 1 && Arrays.equals(window, need)) {
                result.add(i - m + 1);
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Fixed-window anagram problems reduce to maintaining a rolling frequency count and checking equality against a target count — the same skeleton solves Permutation in String and Minimum Window variants.
- `Arrays.equals` on two length-26 arrays is O(26) = O(1), so the whole loop stays O(n); a `matches` counter can shave this constant further but isn't required for correctness or asymptotic complexity.
- Always guard `m > n` up front — sliding window code silently misbehaves on empty windows if you don't.
