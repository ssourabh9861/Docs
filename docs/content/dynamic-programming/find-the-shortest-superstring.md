# Find the Shortest Superstring

**Difficulty:** Very Hard · **Pattern:** TSP-style bitmask DP with pairwise overlap costs, `dp[mask][i]` · [LeetCode](https://leetcode.com/problems/find-the-shortest-superstring/)

## Problem
Given an array of strings `words` (no word is a substring of another), find the shortest string that contains every word in `words` as a substring. If multiple shortest superstrings exist, return any.

## Examples
**Example 1**
```
Input:  words = ["alex","loves","leetcode"]
Output: "alexlovesleetcode"
Explanation: All permutations of "alex","loves","leetcode" produce the same superstring
             length here since none overlap, so any concatenation order works.
```
**Example 2**
```
Input:  words = ["catg","ctaagt","gcta","ttca","atgcatc"]
Output: "gctaagttcatgcatc"
Explanation: Merging in an order that maximizes shared prefix/suffix overlap between
             consecutive words yields a string shorter than plain concatenation.
```

## Constraints
- `1 <= words.length <= 12`
- `1 <= words[i].length <= 20`
- `words[i]` consists of lowercase English letters.
- All strings in `words` are unique. No word is a substring of another word.

## Approach 1 — Precompute overlaps, then Held-Karp DP for best permutation order
**Idea.** First compute `overlap[i][j]` = length of the longest suffix of `words[i]` that is a prefix of `words[j]` (the savings from placing `j` immediately after `i`). Then the problem reduces to: find a permutation (equivalently, a Hamiltonian path visiting all `n` words) that maximizes total overlap savings — a directed TSP-path variant. Use `dp[mask][i]` = the maximum total overlap achievable for an ordering that uses exactly the words in `mask`, ending with word `i` last. Transition: `dp[mask][i] = max over j in mask, j != i of dp[mask ^ (1<<i)][j] + overlap[j][i]`. Track parent pointers to reconstruct the best ending order, then stitch words together using the recorded overlaps (or plain concatenation where two words are never adjacent).

**Complexity.** Time O(n^2 · 2^n) for the DP plus O(n^2 · L) to precompute overlaps (L = max word length), Space O(n · 2^n).
```java
import java.util.*;

class Solution {
    public String shortestSuperstring(String[] words) {
        int n = words.length;
        int[][] overlap = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (i == j) continue;
                overlap[i][j] = maxOverlap(words[i], words[j]);
            }
        }

        int full = 1 << n;
        int[][] dp = new int[full][n];
        int[][] parent = new int[full][n];
        for (int[] row : dp) Arrays.fill(row, -1);

        for (int i = 0; i < n; i++) dp[1 << i][i] = 0;

        for (int mask = 0; mask < full; mask++) {
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) == 0 || dp[mask][i] < 0) continue;
                for (int j = 0; j < n; j++) {
                    if ((mask & (1 << j)) != 0) continue;
                    int newMask = mask | (1 << j);
                    int candidate = dp[mask][i] + overlap[i][j];
                    if (candidate > dp[newMask][j]) {
                        dp[newMask][j] = candidate;
                        parent[newMask][j] = i;
                    }
                }
            }
        }

        int full1 = full - 1;
        int best = 0, last = 0;
        for (int i = 0; i < n; i++) {
            if (dp[full1][i] > best) {
                best = dp[full1][i];
                last = i;
            }
        }

        // Reconstruct order by following parent pointers backward.
        List<Integer> order = new ArrayList<>();
        int mask = full1, cur = last;
        while (cur != -1) {
            order.add(cur);
            int prevMask = mask ^ (1 << cur);
            int prev = (prevMask == 0) ? -1 : parent[mask][cur];
            mask = prevMask;
            cur = prev;
        }
        Collections.reverse(order);

        StringBuilder sb = new StringBuilder(words[order.get(0)]);
        for (int k = 1; k < order.size(); k++) {
            int a = order.get(k - 1), b = order.get(k);
            sb.append(words[b].substring(overlap[a][b]));
        }
        return sb.toString();
    }

    private int maxOverlap(String a, String b) {
        int max = Math.min(a.length(), b.length());
        for (int len = max; len > 0; len--) {
            if (a.endsWith(b.substring(0, len))) return len;
        }
        return 0;
    }
}
```

## Approach 2 — Same DP, cleaner reconstruction via explicit predecessor mask (optimal)
**Idea.** Functionally identical to Approach 1 (this IS the optimal complexity class for this problem — Held-Karp bitmask DP is standard here), but restructure reconstruction to avoid relying on `parent[mask][cur]` needing `mask` to still include `cur` at lookup time, which is a common off-by-one bug source. Store `parent[mask][i]` explicitly as "the node visited immediately before `i` to reach state `(mask, i)`", and walk back by removing `i` from `mask` *after* reading its parent, making the loop invariant explicit and easier to verify.

**Complexity.** Time O(n^2 · 2^n + n^2 · L), Space O(n · 2^n).
```java
import java.util.*;

class Solution {
    public String shortestSuperstring(String[] words) {
        int n = words.length;
        int[][] overlap = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (i != j) overlap[i][j] = maxOverlap(words[i], words[j]);
            }
        }

        int full = 1 << n;
        int[][] dp = new int[full][n];
        int[][] parent = new int[full][n];
        for (int[] row : dp) Arrays.fill(row, -1);
        for (int[] row : parent) Arrays.fill(row, -1);
        for (int i = 0; i < n; i++) dp[1 << i][i] = 0;

        for (int mask = 1; mask < full; mask++) {
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) == 0 || dp[mask][i] < 0) continue;
                int remaining = (~mask) & (full - 1);
                for (int j = 0; j < n; j++) {
                    if ((remaining & (1 << j)) == 0) continue;
                    int newMask = mask | (1 << j);
                    int candidate = dp[mask][i] + overlap[i][j];
                    if (candidate > dp[newMask][j]) {
                        dp[newMask][j] = candidate;
                        parent[newMask][j] = i;
                    }
                }
            }
        }

        int last = 0, best = -1;
        for (int i = 0; i < n; i++) {
            if (dp[full - 1][i] > best) {
                best = dp[full - 1][i];
                last = i;
            }
        }

        int[] order = new int[n];
        int mask = full - 1, node = last;
        for (int pos = n - 1; pos >= 0; pos--) {
            order[pos] = node;
            int prevNode = parent[mask][node];
            mask &= ~(1 << node); // remove node from mask only after reading its parent
            node = prevNode;
        }

        StringBuilder sb = new StringBuilder(words[order[0]]);
        for (int k = 1; k < n; k++) {
            int a = order[k - 1], b = order[k];
            sb.append(words[b].substring(overlap[a][b]));
        }
        return sb.toString();
    }

    private int maxOverlap(String a, String b) {
        int max = Math.min(a.length(), b.length());
        for (int len = max; len > 0; len--) {
            if (a.endsWith(b.substring(0, len))) return len;
        }
        return 0;
    }
}
```

## Key Takeaways
- Reduce the string-merging problem to a graph problem first: precompute pairwise `overlap[i][j]`, then it's exactly Held-Karp TSP-path DP maximizing total edge weight over a Hamiltonian path (not a cycle — no need to return to start).
- `dp[mask][i]` = best cumulative overlap for *some* ordering of `mask`'s words ending at `i`; parent pointers are mandatory here (unlike pure optimization problems) because the answer requires reconstructing an actual string, not just a numeric value.
- Careful ordering of "read parent" vs. "clear bit from mask" during backtracking avoids a subtle indexing bug — always read `parent[mask][node]` while `node` is still included in `mask`.
