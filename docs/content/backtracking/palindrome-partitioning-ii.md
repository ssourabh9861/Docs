# Palindrome Partitioning II

**Difficulty:** Hard · **Pattern:** backtracking search reframed as a min-cut DP · [LeetCode](https://leetcode.com/problems/palindrome-partitioning-ii/)

## Problem
Given a string `s`, partition it so every substring is a palindrome, and return the **minimum number of cuts** needed to achieve such a partition.

## Examples
**Example 1**
```
Input:  s = "aab"
Output: 1
Explanation: One cut gives the palindrome partition ["aa","b"].
```
**Example 2**
```
Input:  s = "a"
Output: 0
Explanation: "a" is already a palindrome, no cuts needed.
```

## Constraints
- `1 <= s.length <= 2000`
- `s` consists of lowercase English letters only

## Approach 1 — Backtracking over all partitions with memoization
**Idea.** This is the same choose/explore/un-choose enumeration as Palindrome Partitioning I: at index `i`, try every end index `j >= i` such that `s[i..j]` is a palindrome, recurse on the remainder, and take `1 + minCuts(rest)` (a cut is needed before the tail unless the tail is empty). Cache results per starting index `i` in `memo[i]` (top-down DP) so overlapping subproblems from different partition branches aren't recomputed — turning exponential partition enumeration into polynomial time. A precomputed `isPalindrome[i][j]` table makes each palindrome check O(1).
**Complexity.** Time O(n^2) (n starting indices × up to n end indices, memoized), Space O(n^2) for the palindrome table + memo.
```java
import java.util.*;

class Solution {
    private Integer[] memo;
    private boolean[][] isPal;
    private String s;

    public int minCut(String s) {
        this.s = s;
        int n = s.length();
        isPal = new boolean[n][n];
        for (int len = 1; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) == s.charAt(j) && (len <= 2 || isPal[i + 1][j - 1])) {
                    isPal[i][j] = true;
                }
            }
        }
        memo = new Integer[n];
        return solve(0);
    }

    // minimum cuts needed to palindrome-partition s[i..n-1]
    private int solve(int i) {
        int n = s.length();
        if (i == n) return -1; // empty tail needs "-1" cuts so the caller's +1 cancels out
        if (memo[i] != null) return memo[i];

        int best = Integer.MAX_VALUE;
        for (int j = i; j < n; j++) {
            if (!isPal[i][j]) continue; // prune: try only valid palindrome prefixes
            int cuts = 1 + solve(j + 1); // choose s[i..j], explore the rest
            best = Math.min(best, cuts);
        }
        memo[i] = best;
        return best;
    }
}
```

## Approach 2 — Bottom-up min-cut DP (optimal / pruned)
**Idea.** Let `cuts[i]` = minimum cuts needed for `s[0..i-1]` (prefix of length `i`). Base case `cuts[0] = -1` (empty prefix needs no cut, offset so the `+1` below works out). Expand the palindrome table the same way, then for each `i` scan all `j <= i` and take `cuts[i] = min(cuts[i], cuts[j] + 1)` whenever `s[j..i-1]` is a palindrome. This is the direct bottom-up form of Approach 1's recursion — same transition, no recursion/memo overhead, and it's the standard "optimal" solution taught for this problem. An even faster O(n) amortized variant expands palindromes around centers on the fly instead of precomputing the full table, but the O(n^2) DP below is the canonical optimal approach.
**Complexity.** Time O(n^2), Space O(n^2) for the palindrome table (can be reduced to O(n) with center-expansion, but O(n^2) is standard).
```java
class Solution {
    public int minCut(String s) {
        int n = s.length();
        boolean[][] isPal = new boolean[n][n];
        for (int len = 1; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) == s.charAt(j) && (len <= 2 || isPal[i + 1][j - 1])) {
                    isPal[i][j] = true;
                }
            }
        }

        int[] cuts = new int[n + 1];
        cuts[0] = -1; // 0-length prefix: no cut needed
        for (int i = 1; i <= n; i++) {
            cuts[i] = i - 1; // worst case: cut before every character
            for (int j = 0; j < i; j++) {
                if (isPal[j][i - 1]) {
                    cuts[i] = Math.min(cuts[i], cuts[j] + 1);
                }
            }
        }
        return cuts[n];
    }
}
```

## Key Takeaways
- This problem is the "count the minimum choices" sibling of Palindrome Partitioning I's "enumerate all choices" — the backtracking recursion (choose a palindrome prefix, explore the rest, un-choose) is identical; only the return value changes from a list of partitions to a minimum cut count.
- Precomputing `isPalindrome[i][j]` via the classic expand-by-length DP turns every palindrome check inside the search into O(1), which is what makes the overall algorithm polynomial instead of exponential.
- Memoizing the backtracking recursion on the single index `i` is legal because the subproblem "min cuts for suffix starting at i" depends only on `i`, not on the path taken to reach it — this is what collapses the naive exponential partition search into O(n^2).
- The bottom-up DP is just the memoized recursion rewritten iteration-first; recognizing that equivalence is the key insight for turning a backtracking solution into a DP one.
