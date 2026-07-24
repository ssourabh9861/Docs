# Longest Substring with At Least K Repeating Characters

**Difficulty:** Hard · **Pattern:** Divide-and-conquer split + fixed-distinct-count sliding window · [LeetCode](https://leetcode.com/problems/longest-substring-with-at-least-k-repeating-characters/)

## Problem
Given a string `s` and an integer `k`, find the length of the longest substring in which every distinct character appears at least `k` times.

## Examples
**Example 1**
```
Input:  s = "aaabb", k = 3
Output: 3
Explanation: The longest substring is "aaa", where 'a' appears 3 times. Note "aaabb" itself fails since 'b' appears only 2 times.
```
**Example 2**
```
Input:  s = "ababbc", k = 2
Output: 5
Explanation: The longest substring is "ababb", where 'a' appears 2 times and 'b' appears 3 times.
```

## Constraints
- `1 <= s.length <= 10^4`
- `s` consists of only lowercase English letters.
- `1 <= k <= 10^5`

## Approach 1 — Divide and Conquer
**Idea.** Count character frequencies for the whole string. Any character with total frequency `< k` can never appear in a valid answer, so it must act as a "splitter": recursively solve the problem on each substring obtained by splitting `s` at every occurrence of such a character, and return the max. If no character has frequency `< k`, the whole string is already valid — return its length.
**Complexity.** Time O(26n) in the typical case (each level removes at least one distinct character, so at most 26 levels of recursion, each doing O(n) work), worst case O(n²) for adversarial inputs; Space O(n) recursion stack.
```java
class Solution {
    public int longestSubstring(String s, int k) {
        return helper(s, 0, s.length(), k);
    }

    private int helper(String s, int start, int end, int k) {
        if (end - start < k) return 0;

        int[] freq = new int[26];
        for (int i = start; i < end; i++) {
            freq[s.charAt(i) - 'a']++;
        }

        for (int i = start; i < end; i++) {
            char c = s.charAt(i);
            if (freq[c - 'a'] < k && freq[c - 'a'] > 0) {
                // split at this character (skip it) and recurse both halves
                int left = helper(s, start, i, k);
                int right = helper(s, i + 1, end, k);
                return Math.max(left, right);
            }
        }
        // every character in [start, end) occurs at least k times
        return end - start;
    }
}
```

## Approach 2 — Sliding Window over Fixed Distinct-Character Count (optimal, no recursion)
**Idea.** The number of distinct characters in the optimal answer is unknown but bounded (at most 26 for lowercase letters). Iterate `maxDistinct` from 1 to 26; for each fixed target, run a sliding window that expands `right` while tracking: `distinctCount` (distinct chars in window) and `countAtLeastK` (distinct chars whose frequency in the window has reached `k`). Shrink `left` whenever `distinctCount > maxDistinct`. Whenever `distinctCount == countAtLeastK` (meaning every character currently in the window satisfies the `>= k` requirement), the window is valid — update the answer.
**Complexity.** Time O(26n) = O(n), Space O(1) (26-letter alphabet arrays).
```java
class Solution {
    public int longestSubstring(String s, int k) {
        int n = s.length();
        int result = 0;

        for (int maxDistinct = 1; maxDistinct <= 26; maxDistinct++) {
            int[] freq = new int[26];
            int left = 0, distinctCount = 0, countAtLeastK = 0;

            for (int right = 0; right < n; right++) {
                int rc = s.charAt(right) - 'a';
                if (freq[rc] == 0) distinctCount++;
                freq[rc]++;
                if (freq[rc] == k) countAtLeastK++;

                while (distinctCount > maxDistinct) {
                    int lc = s.charAt(left) - 'a';
                    if (freq[lc] == k) countAtLeastK--;
                    freq[lc]--;
                    if (freq[lc] == 0) distinctCount--;
                    left++;
                }

                if (distinctCount == maxDistinct && distinctCount == countAtLeastK) {
                    result = Math.max(result, right - left + 1);
                }
            }
        }
        return result;
    }
}
```

## Key Takeaways
- The "iterate over fixed distinct-character budget" pattern converts an otherwise ambiguous constraint (unknown number of distinct chars in the optimal window) into 26 clean, monotonic sliding-window passes — a reusable technique whenever a "window validity" depends on both distinct count and per-character frequency thresholds.
- Classic trap: in the divide-and-conquer approach, forgetting to skip over runs of the splitting character (or mishandling recursion bounds) leads to infinite recursion or off-by-one substring bounds; also its worst-case complexity is not truly linear despite typically performing well.
- Related problems: Longest Substring with At Most K Distinct Characters, Subarrays with K Different Integers, Fruit Into Baskets — all explore variations on distinct-character-bounded windows.
