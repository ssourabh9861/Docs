# Longest Substring with At Most K Distinct Characters

**Difficulty:** Medium · **Pattern:** Variable window with distinct-count frequency map · [LeetCode](https://leetcode.com/problems/longest-substring-with-at-most-k-distinct-characters/)

## Problem
Given a string `s` and an integer `k`, find the length of the longest substring that contains at most `k` distinct characters.

## Examples
**Example 1**
```
Input:  s = "eceba", k = 2
Output: 3
Explanation: The substring "ece" has 2 distinct characters and length 3.
```
**Example 2**
```
Input:  s = "aa", k = 1
Output: 2
Explanation: The substring "aa" has 1 distinct character and length 2.
```

## Constraints
- `1 <= s.length <= 5 * 10^4`
- `0 <= k <= 50`

## Approach 1 — Brute Force
**Idea.** Check every substring, count distinct characters with a set, and track the max length among those with at most `k` distinct characters.
**Complexity.** Time O(n²), Space O(k) per check.
```java
class Solution {
    public int lengthOfLongestSubstringKDistinct(String s, int k) {
        int n = s.length(), maxLen = 0;
        for (int i = 0; i < n; i++) {
            java.util.Set<Character> distinct = new java.util.HashSet<>();
            for (int j = i; j < n; j++) {
                distinct.add(s.charAt(j));
                if (distinct.size() <= k) {
                    maxLen = Math.max(maxLen, j - i + 1);
                } else {
                    break;
                }
            }
        }
        return maxLen;
    }
}
```

## Approach 2 — Sliding Window with Frequency Map (optimal)
**Idea.** Expand `right`, updating a frequency map. Whenever the number of distinct keys exceeds `k`, shrink from `left`, decrementing counts and removing entries that hit zero, until distinct count is back to `<= k`. Track the max window length at each step.
**Complexity.** Time O(n) — each pointer moves forward at most n times, Space O(k) for the map.
```java
class Solution {
    public int lengthOfLongestSubstringKDistinct(String s, int k) {
        if (k == 0) return 0;
        java.util.Map<Character, Integer> freq = new java.util.HashMap<>();
        int left = 0, maxLen = 0;

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            freq.merge(c, 1, Integer::sum);

            while (freq.size() > k) {
                char leftChar = s.charAt(left);
                freq.put(leftChar, freq.get(leftChar) - 1);
                if (freq.get(leftChar) == 0) {
                    freq.remove(leftChar);
                }
                left++;
            }
            maxLen = Math.max(maxLen, right - left + 1);
        }
        return maxLen;
    }
}
```

## Approach 3 — Array-Based Frequency Counter (micro-optimized)
**Idea.** Since characters are typically bounded (e.g., ASCII/lowercase letters), replace the `HashMap` with a fixed-size `int[]` array and track `distinct` explicitly with a counter, avoiding hashing overhead.
**Complexity.** Time O(n), Space O(1) (fixed 256-size array).
```java
class Solution {
    public int lengthOfLongestSubstringKDistinct(String s, int k) {
        if (k == 0) return 0;
        int[] freq = new int[256];
        int left = 0, distinct = 0, maxLen = 0;

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (freq[c] == 0) distinct++;
            freq[c]++;

            while (distinct > k) {
                char leftChar = s.charAt(left);
                freq[leftChar]--;
                if (freq[leftChar] == 0) distinct--;
                left++;
            }
            maxLen = Math.max(maxLen, right - left + 1);
        }
        return maxLen;
    }
}
```

## Key Takeaways
- This is the canonical "at most k distinct" window: expand freely, shrink only when the distinct-count invariant is violated — the invariant is monotonic, which is what makes a single two-pointer pass correct.
- Classic trap: forgetting to remove a key from the map entirely once its count hits zero — leaving a stale zero-count entry inflates `freq.size()` and breaks the distinct-count check.
- Related problems: Longest Substring Without Repeating Characters (k = infinite/unique), Fruit Into Baskets (k = 2 special case), Subarrays with K Different Integers (exactly-k via atMost(k) - atMost(k-1)).
