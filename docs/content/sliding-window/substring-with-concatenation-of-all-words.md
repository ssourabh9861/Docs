# Substring with Concatenation of All Words

**Difficulty:** Hard · **Pattern:** Fixed-size window of word-blocks with frequency matching · [LeetCode](https://leetcode.com/problems/substring-with-concatenation-of-all-words/)

## Problem
Given a string `s` and an array `words` where all words have the same length, find the starting indices of all substrings in `s` that are a concatenation of each word in `words` exactly once, in any order.

## Examples
**Example 1**
```
Input:  s = "barfoothefoobarman", words = ["foo","bar"]
Output: [0,9]
Explanation: Substring starting at 0 is "barfoo", at 9 is "foobar", both concatenations of "foo" and "bar".
```
**Example 2**
```
Input:  s = "wordgoodgoodgoodbestword", words = ["word","good","best","word"]
Output: []
Explanation: No substring is a concatenation of every word in words exactly once (words has "word" twice).
```

## Constraints
- `1 <= s.length <= 10^4`
- `1 <= words.length <= 5000`
- `1 <= words[i].length <= 30`
- `s` and `words[i]` consist of lowercase English letters.
- All `words[i]` have the same length.

## Approach 1 — Brute Force
**Idea.** For every starting index in `s`, try to peel off `words.length` consecutive blocks of length `wordLen` and check via a frequency map whether they exactly match the multiset `words`.
**Complexity.** Time O(n · m · L) where n = |s|, m = number of words, L = word length, Space O(m) for the frequency map.
```java
class Solution {
    public java.util.List<Integer> findSubstring(String s, String[] words) {
        java.util.List<Integer> result = new java.util.ArrayList<>();
        if (words.length == 0) return result;
        int wordLen = words[0].length();
        int numWords = words.length;
        int totalLen = wordLen * numWords;
        int n = s.length();

        java.util.Map<String, Integer> wordCount = new java.util.HashMap<>();
        for (String w : words) wordCount.merge(w, 1, Integer::sum);

        for (int i = 0; i + totalLen <= n; i++) {
            java.util.Map<String, Integer> seen = new java.util.HashMap<>();
            int j = 0;
            for (; j < numWords; j++) {
                int start = i + j * wordLen;
                String word = s.substring(start, start + wordLen);
                seen.merge(word, 1, Integer::sum);
                if (seen.get(word) > wordCount.getOrDefault(word, 0)) break;
            }
            if (j == numWords) result.add(i);
        }
        return result;
    }
}
```

## Approach 2 — Sliding Window per Offset (optimal)
**Idea.** Instead of restarting the word-scan at every index, slide a window word-by-word. Since each valid window is a concatenation of exactly `numWords` blocks of length `wordLen`, only `wordLen` distinct starting *offsets* (0, 1, ..., wordLen-1) need to be checked — within a fixed offset, consecutive windows shift by exactly one word-block, so a two-pointer/deque-like approach can add one word on the right and drop one word on the left in O(1) amortized per step, using a frequency map to track "extra"/"missing" counts.
**Complexity.** Time O(n · wordLen / wordLen) = O(n) total across all offsets, i.e. O(n) overall since work per offset is O(n/wordLen) and there are wordLen offsets, Space O(m) for the count maps.
```java
class Solution {
    public java.util.List<Integer> findSubstring(String s, String[] words) {
        java.util.List<Integer> result = new java.util.ArrayList<>();
        if (words.length == 0 || s.isEmpty()) return result;

        int wordLen = words[0].length();
        int numWords = words.length;
        int totalLen = wordLen * numWords;
        int n = s.length();
        if (n < totalLen) return result;

        java.util.Map<String, Integer> need = new java.util.HashMap<>();
        for (String w : words) need.merge(w, 1, Integer::sum);

        for (int offset = 0; offset < wordLen; offset++) {
            int left = offset, count = 0;
            java.util.Map<String, Integer> window = new java.util.HashMap<>();

            for (int right = offset; right + wordLen <= n; right += wordLen) {
                String word = s.substring(right, right + wordLen);

                if (need.containsKey(word)) {
                    window.merge(word, 1, Integer::sum);
                    count++;

                    // shrink if this word now exceeds what's needed
                    while (window.get(word) > need.get(word)) {
                        String leftWord = s.substring(left, left + wordLen);
                        window.put(leftWord, window.get(leftWord) - 1);
                        count--;
                        left += wordLen;
                    }

                    if (count == numWords) {
                        result.add(left);
                        // slide window forward by one word to look for the next match
                        String leftWord = s.substring(left, left + wordLen);
                        window.put(leftWord, window.get(leftWord) - 1);
                        count--;
                        left += wordLen;
                    }
                } else {
                    // word not in words at all: reset window past it
                    window.clear();
                    count = 0;
                    left = right + wordLen;
                }
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Splitting the scan into `wordLen` independent offsets is the key insight that turns an O(n·m·L) brute force into an O(n) linear scan: within one offset, the window only ever moves in whole-word steps, so each word-block is added/removed from the map at most once per offset.
- Classic trap: treating this as a character-level sliding window (like Minimum Window Substring) — the atomic unit here is a whole word-block, not a single character, so window shrink/expand must move in `wordLen`-sized jumps.
- Related problems: Minimum Window Substring, Permutation in String, Find All Anagrams in a String (all share the need/window frequency-matching pattern, but at the character level).
