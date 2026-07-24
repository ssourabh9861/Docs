# Reorganize String / Rearrange so no two adjacent

**Difficulty:** Medium · **Pattern:** greedy max-heap, always place the most frequent remaining character · [LeetCode](https://leetcode.com/problems/reorganize-string/)

## Problem
Given a string `s`, rearrange its characters so that no two adjacent characters are the same. Return any valid rearrangement, or an empty string if impossible.

## Examples
**Example 1**
```
Input:  s = "aab"
Output: "aba"
Explanation: 'a' appears twice, 'b' once; interleaving avoids adjacent duplicates.
```
**Example 2**
```
Input:  s = "aaab"
Output: ""
Explanation: 'a' appears 3 times among 4 characters — impossible to avoid adjacency (max allowed is ceil(4/2) = 2).
```

## Constraints
- 1 <= s.length <= 500
- s consists of lowercase English letters

## Approach 1 — Max-heap, greedily pick most frequent (with hold-back)
**Idea.** Count character frequencies and push them into a max-heap keyed by count. Repeatedly pop the most frequent character, append it to the result, decrement its count, and hold it aside for one step (so it can't be immediately re-picked next) before pushing it back if it still has remaining count. This "cool down for exactly 1 step" naturally spaces out the most frequent character.
**Complexity.** Time O(n log 26), Space O(26).
```java
import java.util.*;

class Solution {
    public String reorganizeString(String s) {
        int[] freq = new int[26];
        for (char c : s.toCharArray()) freq[c - 'a']++;

        int n = s.length();
        for (int f : freq) {
            if (f > (n + 1) / 2) return ""; // impossible: too dominant a character
        }

        PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> b[1] - a[1]); // [char, count]
        for (int i = 0; i < 26; i++) {
            if (freq[i] > 0) heap.offer(new int[]{i, freq[i]});
        }

        StringBuilder sb = new StringBuilder();
        int[] prev = null; // character held back from last step
        while (!heap.isEmpty()) {
            int[] curr = heap.poll();
            sb.append((char) ('a' + curr[0]));
            curr[1]--;

            if (prev != null && prev[1] > 0) {
                heap.offer(prev);
            }
            prev = curr;
        }
        return sb.toString();
    }
}
```

## Approach 2 — Sort + place at even/odd indices (optimal, no heap)
**Idea.** Sort characters by frequency descending. Fill output positions `0, 2, 4, ...` first with the most frequent character, then continue at `1, 3, 5, ...`, wrapping to even indices when odd ones run out. If the most frequent count exceeds `(n+1)/2`, it's provably impossible. This achieves the same result without heap overhead, using direct index arithmetic.
**Complexity.** Time O(n + 26 log 26), Space O(n).
```java
import java.util.*;

class Solution {
    public String reorganizeString(String s) {
        int n = s.length();
        int[] freq = new int[26];
        for (char c : s.toCharArray()) freq[c - 'a']++;

        int maxFreq = 0, maxChar = 0;
        for (int i = 0; i < 26; i++) {
            if (freq[i] > maxFreq) { maxFreq = freq[i]; maxChar = i; }
        }
        if (maxFreq > (n + 1) / 2) return "";

        char[] result = new char[n];
        int idx = 0;

        // place the most frequent character at even indices first
        while (freq[maxChar] > 0) {
            result[idx] = (char) ('a' + maxChar);
            idx += 2;
            freq[maxChar]--;
        }

        for (int i = 0; i < 26; i++) {
            while (freq[i] > 0) {
                if (idx >= n) idx = 1; // wrap to odd indices
                result[idx] = (char) ('a' + i);
                idx += 2;
                freq[i]--;
            }
        }
        return new String(result);
    }
}
```

## Key Takeaways
- Feasibility check first: a valid arrangement exists iff the max frequency <= ceil(n / 2) — check this before doing any placement work.
- The heap approach generalizes to "no two adjacent" with an arbitrary hold-back window (see Task Scheduler, Rearrange String k Distance Apart), while the sort+index trick is specific to gap-of-exactly-1.
- Both approaches share the same greedy principle: always place the currently most abundant character to avoid it "piling up" and becoming unplaceable later.
