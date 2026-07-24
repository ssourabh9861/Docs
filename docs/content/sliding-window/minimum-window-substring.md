# Minimum Window Substring

**Difficulty:** Hard · **Pattern:** Variable window with frequency-match counter · [LeetCode](https://leetcode.com/problems/minimum-window-substring/)

## Problem
Given strings `s` and `t`, find the smallest substring of `s` that contains every character of `t` (including duplicates). Return `""` if no such window exists.

## Examples
**Example 1**
```
Input:  s = "ADOBECODEBANC", t = "ABC"
Output: "BANC"
Explanation: "BANC" is the smallest substring that includes 'A', 'B', and 'C' from t.
```
**Example 2**
```
Input:  s = "a", t = "a"
Output: "a"
```
**Example 3**
```
Input:  s = "a", t = "aa"
Output: ""
Explanation: t needs two 'a' characters, but s only has one.
```

## Constraints
- `1 <= s.length, t.length <= 10^5`
- `s` and `t` consist of uppercase and lowercase English letters.
- The answer is guaranteed to be unique.

## Approach 1 — Brute Force
**Idea.** For every start index, extend the window until it contains `t`, check length, and record the minimum. Verifying "contains t" each time via a fresh frequency comparison is expensive.
**Complexity.** Time O(n² · m) in the worst case, Space O(m).
```java
class Solution {
    public String minWindow(String s, String t) {
        int n = s.length();
        String best = "";
        for (int i = 0; i < n; i++) {
            for (int j = i; j < n; j++) {
                String candidate = s.substring(i, j + 1);
                if (contains(candidate, t)) {
                    if (best.isEmpty() || candidate.length() < best.length()) {
                        best = candidate;
                    }
                    break; // shortest window starting at i found
                }
            }
        }
        return best;
    }

    private boolean contains(String window, String t) {
        int[] need = new int[128];
        for (char c : t.toCharArray()) need[c]++;
        int[] have = new int[128];
        for (char c : window.toCharArray()) have[c]++;
        for (int c = 0; c < 128; c++) {
            if (have[c] < need[c]) return false;
        }
        return true;
    }
}
```

## Approach 2 — Sliding Window with Need/Have Counters (optimal)
**Idea.** Build a frequency map `need` for `t`. Expand `right`, decrementing `need[c]` and incrementing `have[c]`; track `formed`, the count of distinct characters whose required frequency is currently satisfied. Once `formed == need.size()`, shrink `left` greedily to minimize the window while it stays valid, recording the best answer at each valid state.
**Complexity.** Time O(|s| + |t|), Space O(|s| + |t|) (charset bounded, so effectively O(1) alphabet + window bookkeeping).
```java
class Solution {
    public String minWindow(String s, String t) {
        if (s.isEmpty() || t.isEmpty() || s.length() < t.length()) return "";

        java.util.Map<Character, Integer> need = new java.util.HashMap<>();
        for (char c : t.toCharArray()) {
            need.merge(c, 1, Integer::sum);
        }
        int required = need.size();

        java.util.Map<Character, Integer> windowCounts = new java.util.HashMap<>();
        int formed = 0;
        int left = 0;
        int bestLen = Integer.MAX_VALUE, bestLeft = 0;

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            windowCounts.merge(c, 1, Integer::sum);
            if (need.containsKey(c) && windowCounts.get(c).intValue() == need.get(c).intValue()) {
                formed++;
            }

            while (formed == required) {
                if (right - left + 1 < bestLen) {
                    bestLen = right - left + 1;
                    bestLeft = left;
                }
                char leftChar = s.charAt(left);
                windowCounts.put(leftChar, windowCounts.get(leftChar) - 1);
                if (need.containsKey(leftChar) && windowCounts.get(leftChar).intValue() < need.get(leftChar).intValue()) {
                    formed--;
                }
                left++;
            }
        }

        return bestLen == Integer.MAX_VALUE ? "" : s.substring(bestLeft, bestLeft + bestLen);
    }
}
```

## Approach 3 — Array-Based Counters (micro-optimized)
**Idea.** Same two-pointer logic as Approach 2, but replace `HashMap` with fixed-size `int[128]` arrays for `need` and `window` counts, and track how many *required* characters remain unsatisfied via a single decreasing counter. This avoids boxing/hashing overhead.
**Complexity.** Time O(|s| + |t|), Space O(1) (fixed 128-size arrays).
```java
class Solution {
    public String minWindow(String s, String t) {
        int[] need = new int[128];
        int missing = t.length();
        for (char c : t.toCharArray()) need[c]++;

        int left = 0, bestLeft = 0, bestLen = Integer.MAX_VALUE;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (need[c] > 0) missing--;
            need[c]--;

            while (missing == 0) {
                if (right - left + 1 < bestLen) {
                    bestLen = right - left + 1;
                    bestLeft = left;
                }
                char leftChar = s.charAt(left);
                need[leftChar]++;
                if (need[leftChar] > 0) missing++;
                left++;
            }
        }
        return bestLen == Integer.MAX_VALUE ? "" : s.substring(bestLeft, bestLeft + bestLen);
    }
}
```

## Key Takeaways
- The `formed == required` (or `missing == 0`) check is what separates this from simpler windows: it lets you shrink greedily once *all* character quotas are met, guaranteeing the minimal window at that right boundary.
- Classic trap: comparing counts with `>=` everywhere instead of tracking exact "satisfied" transitions — leads to O(26·n) re-scans instead of O(1) updates per step.
- Related problems: Minimum Size Subarray Sum, Substring with Concatenation of All Words, Permutation in String, Find All Anagrams in a String.
