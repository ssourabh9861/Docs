# Remove Invalid Parentheses

**Difficulty:** Hard · **Pattern:** BFS/DFS minimal-removal search with duplicate pruning · [LeetCode](https://leetcode.com/problems/remove-invalid-parentheses/)

## Problem
Given a string `s` containing letters and parentheses, remove the **minimum** number of invalid parentheses so the result is a valid parenthesized string. Return all possible results (no duplicates).

## Examples
**Example 1**
```
Input:  s = "()())("
Output: ["(())","()()"]
Explanation: Removing 1 parenthesis (either the extra ')' or one of the trailing '(' combos) yields these two distinct valid strings; removing fewer isn't possible.
```
**Example 2**
```
Input:  s = ")("
Output: [""]
Explanation: Both characters are unmatched; removing both gives the empty (trivially valid) string.
```

## Constraints
- `1 <= s.length <= 25`
- `s` consists of lowercase English letters and parentheses `'('` and `')'`
- At most 20 parentheses in `s`

## Approach 1 — BFS by removal count (level-order minimal removal)
**Idea.** Treat this as "search over strings reachable by deleting one character at a time." BFS level by level: level `k` contains all strings reachable by removing exactly `k` characters from `s`. At each level, check every string for validity; if any string at this level is valid, collect all valid strings at this level and stop — BFS guarantees this is the level with the *minimum* number of removals. A `visited` set prevents re-processing the same string reached via different deletion orders (dedup).
**Complexity.** Time O(2^n · n) worst case (each level's strings roughly double, each validity check is O(n)), Space O(2^n) for the visited set / queue.
```java
import java.util.*;

class Solution {
    public List<String> removeInvalidParentheses(String s) {
        List<String> result = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        Queue<String> queue = new LinkedList<>();
        queue.add(s);
        visited.add(s);
        boolean found = false;

        while (!queue.isEmpty()) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                String cur = queue.poll();
                if (isValid(cur)) {
                    result.add(cur);
                    found = true; // this level yields valid strings; don't go deeper
                }
                if (found) continue; // still drain this level's queue, but stop expanding
                for (int j = 0; j < cur.length(); j++) {
                    if (cur.charAt(j) != '(' && cur.charAt(j) != ')') continue;
                    String next = cur.substring(0, j) + cur.substring(j + 1); // choose: remove char j
                    if (visited.add(next)) { // dedup
                        queue.add(next);
                    }
                }
            }
            if (found) break; // minimal-removal level found
        }
        return result;
    }

    private boolean isValid(String str) {
        int balance = 0;
        for (char c : str.toCharArray()) {
            if (c == '(') balance++;
            else if (c == ')') {
                balance--;
                if (balance < 0) return false;
            }
        }
        return balance == 0;
    }
}
```

## Approach 2 — DFS with precomputed removal counts + skip-duplicate pruning (optimal / pruned)
**Idea.** First scan `s` once to count exactly how many `'('` and `')'` must be removed (`leftRemove`, `rightRemove`) by tracking balance: an unmatched `')'` (balance would go negative) forces a `rightRemove++`; leftover unmatched `'('` at the end become `leftRemove`. Then DFS through the string index by index with two choices per parenthesis character: **keep it** or **remove it** (only if the corresponding remove-budget is still `> 0`), while maintaining a running `openCount` to prune illegal states early (never let a `')'` be kept if it would make `openCount` negative). Skip consecutive identical parentheses at the same recursion level (`if (i > start && s[i] == s[i-1]) continue` style) to avoid generating duplicate strings, exactly like the skip-equal dedup trick in Subsets II/Permutations II. This avoids the visited-set memory of BFS and prunes invalid states immediately instead of generating and testing them.
**Complexity.** Time O(2^n) worst case but with heavy pruning (skip-duplicate + budget checks make it far tighter in practice), Space O(n) recursion depth + output.
```java
import java.util.*;

class Solution {
    private List<String> result = new ArrayList<>();

    public List<String> removeInvalidParentheses(String s) {
        int leftRemove = 0, rightRemove = 0;
        for (char c : s.toCharArray()) {
            if (c == '(') leftRemove++;
            else if (c == ')') {
                if (leftRemove > 0) leftRemove--; // matches an earlier unmatched '('
                else rightRemove++;               // no '(' left to match: must remove this ')'
            }
        }
        dfs(s, 0, leftRemove, rightRemove);
        return result;
    }

    private void dfs(String s, int start, int leftRemove, int rightRemove) {
        if (leftRemove == 0 && rightRemove == 0) {
            if (isValid(s)) result.add(s);
            return;
        }
        for (int i = start; i < s.length(); i++) {
            if (i > start && s.charAt(i) == s.charAt(i - 1)) continue; // skip duplicate siblings

            char c = s.charAt(i);
            if (c != '(' && c != ')') continue;

            String removed = s.substring(0, i) + s.substring(i + 1); // choose: remove char i

            if (c == '(' && leftRemove > 0) {
                dfs(removed, i, leftRemove - 1, rightRemove); // explore
            } else if (c == ')' && rightRemove > 0) {
                dfs(removed, i, leftRemove, rightRemove - 1); // explore
            }
            // un-choose is implicit: `removed` is a separate string, original `s` untouched for the next i
        }
    }

    private boolean isValid(String str) {
        int balance = 0;
        for (char c : str.toCharArray()) {
            if (c == '(') balance++;
            else if (c == ')') {
                balance--;
                if (balance < 0) return false;
            }
        }
        return balance == 0;
    }
}
```

## Key Takeaways
- BFS naturally finds the *minimum*-removal answer first because it explores level-by-level in increasing number of deletions — the first level with any valid string is guaranteed optimal.
- The `visited` set in BFS is essential; without it the same string reachable via different deletion orders would be reprocessed repeatedly, exploding the runtime.
- Approach 2's precomputed `(leftRemove, rightRemove)` budget converts the problem from "try all subsets of deletions and check minimality" into "try only deletions that could possibly be minimal," which is a large pruning win.
- The `if (i > start && s[i] == s[i-1]) continue` skip is the same skip-equal-sibling dedup idiom seen in Permutations II / Subsets II / Combination Sum II, applied here to avoid emitting the same resulting string from two different equal-character removals.
