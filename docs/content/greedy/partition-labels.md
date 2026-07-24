# Partition Labels

**Difficulty:** Medium · **Pattern:** interval coverage via last-occurrence greedy · [LeetCode](https://leetcode.com/problems/partition-labels/)

## Problem
Given a string `s`, partition it into as many contiguous parts as possible such that each letter appears in at most one part. Return a list of the sizes of these parts, in order.

## Examples
**Example 1**
```
Input:  s = "ababcbacadefegdehijhklij"
Output: [9,7,8]
Explanation: "ababcbaca", "defegde", "hijhklij" — each letter's full span is contained in exactly one part.
```

**Example 2**
```
Input:  s = "eccbbbbdec"
Output: [10]
Explanation: 'e' first appears at index 0 and last at index 9, forcing the entire string into one part.
```

## Constraints
- `1 <= s.length <= 500`
- `s` consists of lowercase English letters only.

## Approach 1 — Last-Occurrence Greedy Boundary
**Idea.** First record the last index at which each character appears. Then scan left to right, extending the current partition's `end` to be the max of `end` and the last occurrence of each character seen so far. When the scan index reaches `end`, no character inside the current window can reappear later — every one of them has its last occurrence within `[start, end]` — so this is the earliest safe place to cut. Cutting here greedily maximizes the number of partitions: closing later would only merge partitions unnecessarily, and closing earlier would violate the single-partition-per-letter rule (a contradiction, since `end` is defined as the exact point where all seen letters are fully resolved).
**Complexity.** Time O(n), Space O(1) (fixed 26-letter table).
```java
class Solution {
    public List<Integer> partitionLabels(String s) {
        int[] lastIndex = new int[26];
        for (int i = 0; i < s.length(); i++) {
            lastIndex[s.charAt(i) - 'a'] = i;
        }

        List<Integer> result = new ArrayList<>();
        int start = 0, end = 0;
        for (int i = 0; i < s.length(); i++) {
            end = Math.max(end, lastIndex[s.charAt(i) - 'a']);
            if (i == end) {
                result.add(end - start + 1);
                start = i + 1;
            }
        }
        return result;
    }
}
```

## Approach 2 — Interval Merge Baseline
**Idea.** For each character, build the interval `[firstOccurrence, lastOccurrence]`, sort by start, and merge overlapping intervals — this is the general interval-merging technique specialized to per-character spans. It reaches the same partitions but pays extra for building and sorting explicit intervals, whereas the single pass exploits that characters already appear in string order, so no sort is needed.
**Complexity.** Time O(n + 26 log 26) ~ O(n), Space O(26).
```java
class Solution {
    public List<Integer> partitionLabels(String s) {
        int[] first = new int[26];
        int[] last = new int[26];
        Arrays.fill(first, -1);
        for (int i = 0; i < s.length(); i++) {
            int c = s.charAt(i) - 'a';
            if (first[c] == -1) first[c] = i;
            last[c] = i;
        }

        List<int[]> intervals = new ArrayList<>();
        for (int c = 0; c < 26; c++) {
            if (first[c] != -1) intervals.add(new int[]{first[c], last[c]});
        }
        intervals.sort((a, b) -> a[0] - b[0]);

        List<Integer> result = new ArrayList<>();
        int start = intervals.get(0)[0], end = intervals.get(0)[1];
        for (int[] iv : intervals) {
            if (iv[0] > end) {
                result.add(end - start + 1);
                start = iv[0];
                end = iv[1];
            } else {
                end = Math.max(end, iv[1]);
            }
        }
        result.add(end - start + 1);
        return result;
    }
}
```

## Key Takeaways
- Greedy choice: cut a partition the instant the running index catches up to the farthest last-occurrence seen so far — that is the earliest point at which no letter can leak into a later part.
- Precomputing last occurrences turns "does this letter appear again later" into an O(1) lookup, enabling a single linear pass.
- The interval-merge view generalizes the idea (useful when input isn't a single traversal order) but is unnecessary overhead here since the string's natural order already sorts the interval starts.
