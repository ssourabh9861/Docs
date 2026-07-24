# Distinct Echo Substrings

**Difficulty:** Hard · **Pattern:** Rolling hash (Rabin-Karp) over all "doubled" substrings, deduplicated with a hash set · [LeetCode](https://leetcode.com/problems/distinct-echo-substrings/)

## Problem
Return the number of distinct non-empty substrings of `text` that can be written as the concatenation of some string with itself (i.e., `substring = w + w` for some string `w`). Count distinct substring *values*, not occurrences.

## Examples
**Example 1**
```
Input:  text = "abcabcabc"
Output: 3
Explanation: Three echo substrings are "abcabc" (= "abc"+"abc", index 0),
"bcabca" (= "bca"+"bca", index 1), and "cabcab" (= "cab"+"cab", index 2).
```

**Example 2**
```
Input:  text = "leetcodeleetcode"
Output: 2
Explanation: "ee" and "leetcodeleetcode" are the two distinct echo substrings.
```

## Constraints
- 1 <= text.length <= 2000
- text has only lowercase English letters.

## Approach 1 — Brute force substring comparison
**Idea.** For every even length `len = 2k` and every starting index `i`, extract `text[i..i+len)`, split it into two halves of size `k`, and compare them with `String.equals`. Collect distinct matching substrings in a `HashSet<String>`.
**Complexity.** Time O(n^3) (O(n^2) substrings, O(n) each to compare/hash as a String), Space O(n^2) worst case for the set.
```java
import java.util.*;

class Solution {
    public int distinctEchoSubstrings(String text) {
        int n = text.length();
        Set<String> distinct = new HashSet<>();
        for (int len = 2; len <= n; len += 2) {
            int half = len / 2;
            for (int i = 0; i + len <= n; i++) {
                if (text.regionMatches(i, text, i + half, half)) {
                    distinct.add(text.substring(i, i + len));
                }
            }
        }
        return distinct.size();
    }
}
```

## Approach 2 — Rolling hash (Rabin-Karp) to compare halves in O(1) (optimal)
**Idea.** Precompute prefix hashes of `text` under a polynomial rolling hash (with a large prime modulus and random-ish base) so that the hash of **any** substring `text[l..r)` can be retrieved in O(1) via the standard prefix-hash-difference formula:

```
hash(l, r) = prefixHash[r] - prefixHash[l] * base^(r-l)   (mod p)
```

For every even length `len = 2k` and start `i`, compare `hash(i, i+k)` to `hash(i+k, i+2k)` in O(1) instead of O(n) string comparison. Only when the hashes match do we pay the O(k) cost of an actual `regionMatches` to guard against hash collisions (or, on LeetCode's small constraints, many solutions skip this since collisions are astronomically unlikely with a 64-bit modulus) before inserting the substring into the dedup set (a `Set<String>`, or a `Set<Long>` of the substring's hash for fully O(1) dedup at the cost of hypothetical collisions).
**Complexity.** Time O(n^2) (all substring lengths/positions are still enumerated, but each half-comparison is O(1) instead of O(n)), Space O(n) for prefix hashes plus O(n^2) worst case for the distinct set.
```java
import java.util.*;

class Solution {
    public int distinctEchoSubstrings(String text) {
        int n = text.length();
        long MOD = 1_000_000_007L;
        long BASE = 131;

        long[] prefixHash = new long[n + 1];
        long[] power = new long[n + 1];
        power[0] = 1;
        for (int i = 0; i < n; i++) {
            prefixHash[i + 1] = (prefixHash[i] * BASE + text.charAt(i)) % MOD;
            power[i + 1] = (power[i] * BASE) % MOD;
        }

        Set<String> distinct = new HashSet<>();
        for (int len = 2; len <= n; len += 2) {
            int half = len / 2;
            for (int i = 0; i + len <= n; i++) {
                long hashLeft = getHash(prefixHash, power, MOD, i, i + half);
                long hashRight = getHash(prefixHash, power, MOD, i + half, i + len);
                if (hashLeft == hashRight) {
                    // verify to guard against hash collisions
                    if (text.regionMatches(i, text, i + half, half)) {
                        distinct.add(text.substring(i, i + len));
                    }
                }
            }
        }
        return distinct.size();
    }

    // hash of text[l, r) using prefix hash difference
    private long getHash(long[] prefixHash, long[] power, long mod, int l, int r) {
        long h = (prefixHash[r] - prefixHash[l] * power[r - l]) % mod;
        return h < 0 ? h + mod : h;
    }
}
```

## Key Takeaways
- Rolling hash turns "compare two substrings" into an O(1) operation once prefix hashes and powers of the base are precomputed — the enabling trick behind Rabin-Karp-style substring matching.
- Always verify a hash match with a direct character comparison when correctness matters and the modulus/base could theoretically collide; on constrained inputs (n <= 2000 here) this verification is cheap insurance.
- The final answer still needs value-based deduplication (`Set<String>`), because the question asks for distinct substring *values*, not distinct (start, length) pairs — the hash only accelerates the half-comparison, not the counting.
