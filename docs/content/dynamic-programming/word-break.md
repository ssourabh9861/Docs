# Word Break

**Difficulty:** Medium · **Pattern:** 1-D DP — boolean reachability over prefixes · [LeetCode](https://leetcode.com/problems/word-break/)

## Problem
Given a string `s` and a dictionary of strings `wordDict`, determine if `s` can be segmented into a sequence of one or more dictionary words (words can be reused).

## Examples
**Example 1**
```
Input:  s = "leetcode", wordDict = ["leet","code"]
Output: true
Explanation: "leetcode" splits into "leet" + "code", both in the dictionary.
```

**Example 2**
```
Input:  s = "catsandog", wordDict = ["cats","dog","sand","and","cat"]
Output: false
Explanation: No combination of dictionary words reconstructs the full string.
```

## Constraints
- 1 <= s.length <= 300
- 1 <= wordDict.length <= 1000
- 1 <= wordDict[i].length <= 20
- s and wordDict[i] consist of lowercase English letters.

## Approach 1 — Top-Down Memoization
**Idea.** Define `canBreak(i)` = true if suffix `s[i..n-1]` can be segmented into dictionary words. Base case `canBreak(n) = true` (empty suffix). Recurrence: `canBreak(i) = OR over all j in (i, n]` such that `s[i..j-1]` is a dictionary word, of `canBreak(j)`. Memoize on `i` since suffix is fully determined by the start index.

**Complexity.** Time O(n^2) (n starting points, up to n substring checks each, substring check O(n)), Space O(n) for memo + word set.
```java
import java.util.*;

class Solution {
    private Boolean[] memo;
    private Set<String> dict;
    private String s;

    public boolean wordBreak(String s, List<String> wordDict) {
        this.s = s;
        this.dict = new HashSet<>(wordDict);
        this.memo = new Boolean[s.length() + 1];
        return canBreak(0);
    }

    private boolean canBreak(int i) {
        int n = s.length();
        if (i == n) return true;
        if (memo[i] != null) return memo[i];

        for (int j = i + 1; j <= n; j++) {
            if (dict.contains(s.substring(i, j)) && canBreak(j)) {
                return memo[i] = true;
            }
        }
        return memo[i] = false;
    }
}
```

## Approach 2 — Bottom-Up Tabulation
**Idea.** `dp[i]` = true if prefix `s[0..i-1]` can be fully segmented. `dp[0] = true` (empty prefix). For each end position `i`, scan possible split points `j < i`: `dp[i] = OR over j` with `dp[j] == true` and `s[j..i-1]` in dictionary. Answer is `dp[n]`. This avoids recursion overhead and is easy to bound with word-length limits for a minor speedup.

**Complexity.** Time O(n^2) worst case (can be reduced using max word length as inner loop bound), Space O(n).
```java
import java.util.*;

class Solution {
    public boolean wordBreak(String s, List<String> wordDict) {
        Set<String> dict = new HashSet<>(wordDict);
        int n = s.length();
        boolean[] dp = new boolean[n + 1];
        dp[0] = true;

        int maxLen = 0;
        for (String w : dict) maxLen = Math.max(maxLen, w.length());

        for (int i = 1; i <= n; i++) {
            for (int j = Math.max(0, i - maxLen); j < i; j++) {
                if (dp[j] && dict.contains(s.substring(j, i))) {
                    dp[i] = true;
                    break;
                }
            }
        }
        return dp[n];
    }
}
```

## Key Takeaways
- This is a "reachability" DP: think of positions `0..n` as nodes and each dictionary word as an edge; the question is whether node `n` is reachable from node `0`.
- Bounding the inner loop by the longest word length in the dictionary avoids wasted substring checks.
- A `HashSet<String>` lookup is O(word length); a trie can improve constants but isn't required at these constraints.
