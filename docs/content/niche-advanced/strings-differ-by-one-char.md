# Strings Differ by One Character

**Difficulty:** Hard · **Pattern:** Hashing with "one-char-removed" keys (a hashing generalization of Rabin-Karp-style substring fingerprints) · [LeetCode](https://leetcode.com/problems/strings-differ-by-one-character/)

## Problem
Given a list `dict` of strings, all of the same length, determine whether there exist two **distinct** strings in the list that differ by exactly one character at the same index (all other characters identical). Return `true` if such a pair exists, `false` otherwise.

## Examples
**Example 1**
```
Input:  dict = ["abcd","acbd", "aacd"]
Output: true
Explanation: "abcd" and "aacd" differ only at index 1 ('b' vs 'a'); every other character matches.
```

**Example 2**
```
Input:  dict = ["ab","cd","yz"]
Output: false
```

## Constraints
- 2 <= dict.length <= 10^4
- dict[i].length == dict[j].length for all valid i, j.
- 1 <= dict[i].length <= 100
- dict[i] consists only of lowercase English letters.
- All strings are pairwise distinct (per problem statement).

## Approach 1 — Brute force pairwise comparison
**Idea.** Compare every pair of strings character by character; if the Hamming distance between a pair is exactly 1, return `true`.
**Complexity.** Time O(n^2 * m) where n = dict.length, m = string length, Space O(1).
```java
class Solution {
    public boolean differByOne(String[] dict) {
        int n = dict.length, m = dict[0].length();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                int diff = 0;
                for (int k = 0; k < m && diff <= 1; k++) {
                    if (dict[i].charAt(k) != dict[j].charAt(k)) diff++;
                }
                if (diff == 1) return true;
            }
        }
        return false;
    }
}
```

## Approach 2 — Hashing with a wildcard/"blanked" key at each index (optimal)
**Idea.** Two strings differ by exactly one character at index `k` **if and only if** blanking out (removing or masking) index `k` from both makes them identical. So for every string and every index `k`, compute a hash of "the string with position `k` deleted" (equivalently, `s.substring(0,k) + '*' + s.substring(k+1)` conceptually, but we compute it as a rolling hash rather than materializing a new string). If this "blanked" hash has been seen before (produced by an earlier, different string) at the same index, we've found a matching pair — return `true`. Otherwise insert it into a hash set and continue.

To compute the blanked hash in O(1) per index (after O(m) precomputation per string), use prefix and suffix polynomial rolling hashes:
```
blankedHash(k) = prefixHash[k] * base^(m-k-1) + suffixHash[k+1]
```
where `prefixHash[k]` is the hash of `s[0..k)` and `suffixHash[k+1]` is the hash of `s[k+1..m)`, both computed with the same base/modulus so they combine correctly once shifted to align. This lets us test all `m` positions of a string in O(m) total instead of O(m) per position (which would be O(m^2)).
**Complexity.** Time O(n * m) expected, Space O(n * m) for the hash set.
```java
import java.util.*;

class Solution {
    private static final long MOD = 1_000_000_007L;
    private static final long BASE = 131;

    public boolean differByOne(String[] dict) {
        int n = dict.length;
        int m = dict[0].length();

        long[] pow = new long[m + 1];
        pow[0] = 1;
        for (int i = 1; i <= m; i++) pow[i] = (pow[i - 1] * BASE) % MOD;

        // seen[k] holds the set of "blanked at index k" hashes observed so far
        Set<Long>[] seenAtIndex = new HashSet[m];
        for (int k = 0; k < m; k++) seenAtIndex[k] = new HashSet<>();

        for (String s : dict) {
            int len = s.length();
            long[] prefixHash = new long[len + 1]; // hash of s[0..i)
            for (int i = 0; i < len; i++) {
                prefixHash[i + 1] = (prefixHash[i] * BASE + s.charAt(i)) % MOD;
            }
            // suffixHash[i] = hash of s[i..len) read left to right, as its own polynomial
            long[] suffixHash = new long[len + 1];
            for (int i = len - 1; i >= 0; i--) {
                suffixHash[i] = (suffixHash[i + 1] + (long) s.charAt(i) * pow[len - 1 - i]) % MOD;
            }

            for (int k = 0; k < len; k++) {
                // combine prefix[0,k) and suffix(k,len) shifted to the right length
                long blanked = (prefixHash[k] * pow[len - 1 - k] + suffixHash[k + 1]) % MOD;
                if (!seenAtIndex[k].add(blanked)) {
                    return true; // collision at same index k => strings differ only there
                }
            }
        }
        return false;
    }
}
```

## Key Takeaways
- "Differ by exactly one character" reduces to "equal after removing that one character" — a reusable transform whenever a problem asks about single-position edits.
- Prefix + suffix rolling hashes let you compute "hash with position k deleted" for every `k` in linear total time, avoiding the naive O(m) per-position, O(m^2) per-string cost.
- Bucketing hash sets **per index** (rather than one global set) is essential — two strings might coincidentally share a blanked hash at different positions without truly being a valid one-char-diff pair; keeping index-specific sets keeps the check precise.
