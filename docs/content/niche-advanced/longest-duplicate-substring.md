# Longest Duplicate Substring

**Difficulty:** Hard · **Pattern:** Binary search on answer length + Rabin-Karp rolling hash to test each length · [LeetCode](https://leetcode.com/problems/longest-duplicate-substring/)

## Problem
Given a string `s`, return any duplicated substring that has the maximum possible length. If no duplicated substring exists, return `""`. (A substring is duplicated if it occurs at least twice in `s`, and occurrences may overlap.)

## Examples
**Example 1**
```
Input:  s = "banana"
Output: "ana"
Explanation: "ana" appears at index 1 and index 3 (overlapping), and no length-4 substring repeats.
```

**Example 2**
```
Input:  s = "abcd"
Output: ""
Explanation: No substring repeats.
```

## Constraints
- 2 <= s.length <= 3 * 10^4
- s consists of lowercase English letters.

## Approach 1 — Brute force with a hash set per length
**Idea.** For each candidate length `L` from `n-1` down to 1, slide a window of size `L` across `s`, materialize each substring, and check membership in a `HashSet<String>`. Return the first duplicate found at the largest `L`. Materializing substrings makes this expensive.
**Complexity.** Time O(n^3) worst case (O(n) lengths x O(n) windows x O(n) substring hashing/creation), Space O(n^2).
```java
import java.util.*;

class Solution {
    public String longestDupSubstring(String s) {
        int n = s.length();
        for (int len = n - 1; len >= 1; len--) {
            Set<String> seen = new HashSet<>();
            for (int i = 0; i + len <= n; i++) {
                String sub = s.substring(i, i + len);
                if (!seen.add(sub)) return sub;
            }
        }
        return "";
    }
}
```

## Approach 2 — Binary search on length + Rabin-Karp rolling hash (optimal)
**Idea.** The key monotonic observation: if a duplicated substring of length `L` exists, one of length `L-1` also exists (just truncate it). So "does a duplicate of length >= L exist?" is a monotonic predicate in `L`, and we can **binary search** on `L` in `[1, n-1]`.

For a fixed `L`, checking "does any length-`L` substring repeat?" can be done in O(n) expected time using a **rolling hash**: compute the hash of each length-`L` window in O(1) via the prefix-hash-difference formula (precomputed powers of the base), and store each window's hash in a `HashSet<Long>`. A repeated hash signals a candidate duplicate — verify it with a direct substring comparison to guard against collisions before accepting it (or, when a match is confirmed, immediately return that substring for this `L`).

Binary search drives the length choice: if a duplicate of length `mid` is found, record it and try a larger length (`lo = mid + 1`); otherwise shrink (`hi = mid - 1`). The best (longest) duplicate found across all successful checks is the answer.
**Complexity.** Time O(n log n) expected (O(log n) binary search steps, each an O(n) rolling-hash scan), Space O(n) for prefix hashes and the hash set.
```java
class Solution {
    private final long MOD = (1L << 32) - 1; // large modulus to reduce collisions
    private final long BASE = 26;

    public String longestDupSubstring(String s) {
        int n = s.length();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) nums[i] = s.charAt(i) - 'a';

        int lo = 1, hi = n - 1;
        String result = "";
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            String candidate = search(nums, mid);
            if (candidate != null) {
                result = candidate;
                lo = mid + 1; // try to find a longer duplicate
            } else {
                hi = mid - 1;
            }
        }
        return result;
    }

    // returns a duplicated substring of length exactly `len`, or null if none exists
    private String search(int[] nums, int len) {
        int n = nums.length;
        long hash = 0;
        long power = 1;
        for (int i = 0; i < len; i++) {
            hash = (hash * BASE + nums[i]) % MOD;
            if (i > 0) power = (power * BASE) % MOD;
        }

        java.util.Map<Long, java.util.List<Integer>> seen = new java.util.HashMap<>();
        seen.computeIfAbsent(hash, k -> new java.util.ArrayList<>()).add(0);

        for (int start = 1; start + len <= n; start++) {
            // roll the hash: drop nums[start-1], add nums[start+len-1]
            hash = ((hash - nums[start - 1] * power % MOD + MOD) % MOD) * BASE % MOD;
            hash = (hash + nums[start + len - 1]) % MOD;

            java.util.List<Integer> starts = seen.get(hash);
            if (starts != null) {
                for (int prevStart : starts) {
                    if (isEqual(nums, prevStart, start, len)) {
                        return buildString(nums, start, len);
                    }
                }
            }
            seen.computeIfAbsent(hash, k -> new java.util.ArrayList<>()).add(start);
        }
        return null;
    }

    private boolean isEqual(int[] nums, int i, int j, int len) {
        for (int k = 0; k < len; k++) {
            if (nums[i + k] != nums[j + k]) return false;
        }
        return true;
    }

    private String buildString(int[] nums, int start, int len) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) sb.append((char) ('a' + nums[start + i]));
        return sb.toString();
    }
}
```

## Key Takeaways
- "Longest X with property P" where P is monotonic in length is a strong signal for **binary search on the answer**, turning an O(n^2) or O(n^3) search into O(n log n).
- Rolling hash makes each length check O(n) by reusing the previous window's hash instead of recomputing from scratch — the recurrence `hash' = (hash - outgoing*base^(len-1))*base + incoming (mod p)`.
- Always verify hash collisions with a real comparison (`isEqual`) before trusting a match — with a large modulus collisions are rare, but silently trusting hashes on adversarial or graded inputs can produce wrong answers.
