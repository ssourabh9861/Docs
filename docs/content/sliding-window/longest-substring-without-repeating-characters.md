# Longest Substring Without Repeating Characters

**Difficulty:** Medium · **Pattern:** Variable-size window with last-seen-index map · [LeetCode](https://leetcode.com/problems/longest-substring-without-repeating-characters/)

## Problem
Given a string `s`, find the length of the longest contiguous substring that contains no repeated characters.

## Examples
**Example 1**
```
Input:  s = "abcabcbb"
Output: 3
Explanation: The answer is "abc", with length 3.
```
**Example 2**
```
Input:  s = "bbbbb"
Output: 1
Explanation: The answer is "b", with length 1.
```
**Example 3**
```
Input:  s = "pwwkew"
Output: 3
Explanation: The answer is "wke", with length 3. Note "pwke" is a subsequence, not a substring.
```

## Constraints
- `0 <= s.length <= 5 * 10^4`
- `s` consists of English letters, digits, symbols, and spaces.

## Approach 1 — Brute Force
**Idea.** Check every substring `s[i..j]` for uniqueness using a `HashSet`, tracking the max length found.
**Complexity.** Time O(n³) (O(n²) substrings × O(n) uniqueness check), Space O(min(n, charset)).
```java
class Solution {
    public int lengthOfLongestSubstring(String s) {
        int n = s.length(), maxLen = 0;
        for (int i = 0; i < n; i++) {
            for (int j = i; j < n; j++) {
                if (isUnique(s, i, j)) {
                    maxLen = Math.max(maxLen, j - i + 1);
                }
            }
        }
        return maxLen;
    }

    private boolean isUnique(String s, int start, int end) {
        java.util.Set<Character> seen = new java.util.HashSet<>();
        for (int k = start; k <= end; k++) {
            if (!seen.add(s.charAt(k))) return false;
        }
        return true;
    }
}
```

## Approach 2 — Sliding Window with HashSet
**Idea.** Maintain a window `[left, right]` with a `HashSet` of characters currently inside. Expand `right`; whenever the new character already exists, shrink from `left` (removing characters) until the duplicate is gone.
**Complexity.** Time O(n) amortized (each pointer moves forward at most n times, so O(2n) total), Space O(min(n, charset)).
```java
class Solution {
    public int lengthOfLongestSubstring(String s) {
        java.util.Set<Character> window = new java.util.HashSet<>();
        int left = 0, maxLen = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            while (window.contains(c)) {
                window.remove(s.charAt(left));
                left++;
            }
            window.add(c);
            maxLen = Math.max(maxLen, right - left + 1);
        }
        return maxLen;
    }
}
```

## Approach 3 — Sliding Window with Last-Seen-Index Map (optimal)
**Idea.** Store the last index at which each character was seen. On seeing character `c` again inside the window, jump `left` directly to `lastSeen[c] + 1` instead of shrinking one step at a time — this avoids the inner while-loop entirely.
**Complexity.** Time O(n), single pass, Space O(min(n, charset)).
```java
class Solution {
    public int lengthOfLongestSubstring(String s) {
        int[] lastSeen = new int[128]; // ASCII assumption
        java.util.Arrays.fill(lastSeen, -1);
        int left = 0, maxLen = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (lastSeen[c] >= left) {
                left = lastSeen[c] + 1;
            }
            lastSeen[c] = right;
            maxLen = Math.max(maxLen, right - left + 1);
        }
        return maxLen;
    }
}
```

## Key Takeaways
- The "jump left directly" trick (using last-seen index instead of a while-loop) turns an amortized O(n) solution into a true single-pass O(n) with no revisits.
- Classic trap: forgetting to check `lastSeen[c] >= left` — a stale index from before the current window's start must not move `left` backwards.
- Related problems: Longest Substring with At Most K Distinct, Longest Substring with At Most Two Distinct Characters, Subarray with Distinct Elements.
