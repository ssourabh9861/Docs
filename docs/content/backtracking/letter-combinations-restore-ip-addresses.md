# Letter Combinations of a Phone Number / Restore IP Addresses

**Difficulty:** Medium · **Pattern:** fixed-branching-factor DFS over positions with segment-validity pruning · [LeetCode](https://leetcode.com/problems/letter-combinations-of-a-phone-number/)

## Problem
Two classic "build a fixed-shape string piece by piece" backtracking problems:
- **Letter Combinations of a Phone Number**: given a digit string `digits` (2-9), return all possible letter combinations the digits could represent on a telephone keypad.
- **Restore IP Addresses**: given a digit string `s`, return all ways to insert exactly three dots so the result is a valid IPv4 address (four segments, each `0-255`, no segment with a leading zero unless it is exactly `"0"`).

## Examples
**Example 1 (Letter Combinations)**
```
Input:  digits = "23"
Output: ["ad","ae","af","bd","be","bf","cd","ce","cf"]
Explanation: '2' -> "abc", '3' -> "def"; every combination of one letter from each digit's set.
```
**Example 2 (Restore IP Addresses)**
```
Input:  s = "25525511135"
Output: ["255.255.11.135","255.255.111.35"]
Explanation: Both splits produce four segments each in [0,255] with no invalid leading zeros.
```

## Constraints
- Letter Combinations: `0 <= digits.length <= 4`, digits are `2-9`
- Restore IP Addresses: `1 <= s.length <= 20`, `s` consists of digits only

## Approach 1 — DFS choose/explore/un-choose for both problems
**Idea.** Both problems build a string of fixed structure one piece at a time:
- **Letter Combinations**: map each digit to its letters (`"23"` -> digit 0 has letters `"abc"`, digit 1 has `"def"`). DFS by position: at digit index `i`, try each letter in that digit's mapping, append it, recurse to `i+1`, then remove it (un-choose) before trying the next letter. Base case: `i == digits.length()` means a complete combination is ready to record.
- **Restore IP Addresses**: DFS by trying segment lengths 1-3 at each of 4 required segments. At each step, take the next 1-3 characters as a candidate segment; validate it (numeric value `0-255`, no leading zero unless the segment is `"0"` itself), append with a `.` separator (except before the first segment), recurse for the next segment, then un-choose (strip the appended segment) before trying a different length. Base case: exactly 4 segments placed and the whole string consumed.

**Complexity.** Letter Combinations: Time O(4^n · n) (up to 4 letters per digit, e.g. digit 7/9), Space O(n) recursion. Restore IP Addresses: Time O(3^4) = O(1) bounded (at most 3 length choices per of 4 segments), Space O(1) extra beyond output.
```java
import java.util.*;

class Solution {

    // ---------- Letter Combinations of a Phone Number ----------
    private static final String[] KEYPAD = {
        "abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz" // index 0 -> digit '2', ... index 7 -> digit '9'
    };

    public List<String> letterCombinations(String digits) {
        List<String> result = new ArrayList<>();
        if (digits == null || digits.isEmpty()) return result;
        backtrackLetters(digits, 0, new StringBuilder(), result);
        return result;
    }

    private void backtrackLetters(String digits, int idx, StringBuilder path, List<String> result) {
        if (idx == digits.length()) {
            result.add(path.toString());
            return;
        }
        String letters = KEYPAD[digits.charAt(idx) - '2'];
        for (char ch : letters.toCharArray()) {
            path.append(ch);                    // choose
            backtrackLetters(digits, idx + 1, path, result); // explore
            path.deleteCharAt(path.length() - 1); // un-choose
        }
    }

    // ---------- Restore IP Addresses ----------
    public List<String> restoreIpAddresses(String s) {
        List<String> result = new ArrayList<>();
        if (s.length() < 4 || s.length() > 12) return result;
        backtrackIp(s, 0, 0, new ArrayDeque<>(), result);
        return result;
    }

    private void backtrackIp(String s, int start, int segCount, Deque<String> segments, List<String> result) {
        if (segCount == 4) {
            if (start == s.length()) {
                result.add(String.join(".", segments));
            }
            return;
        }
        for (int len = 1; len <= 3 && start + len <= s.length(); len++) {
            String segment = s.substring(start, start + len);
            if (!isValidSegment(segment)) continue; // prune: invalid segment for any length here on

            segments.addLast(segment);            // choose
            backtrackIp(s, start + len, segCount + 1, segments, result); // explore
            segments.removeLast();                // un-choose
        }
    }

    private boolean isValidSegment(String seg) {
        if (seg.length() > 1 && seg.charAt(0) == '0') return false; // leading zero, e.g. "01"
        int value = Integer.parseInt(seg);
        return value <= 255;
    }
}
```

## Approach 2 — Same DFS with early length pruning (optimal / pruned)
**Idea.** Both problems are already small/bounded (digits.length <= 4; IP segments <= 3 chars, exactly 4 segments), so the "optimal" version is the same DFS with tighter early pruning rather than an asymptotically different algorithm:
- **Letter Combinations**: no meaningful pruning is possible/needed beyond the direct mapping — this problem's DFS *is* the optimal solution since every leaf of the recursion tree is a valid, required answer.
- **Restore IP Addresses**: add an early feasibility prune before recursing — the remaining string length must fit within the remaining segments' min/max span: `remainingSegments * 1 <= remainingChars <= remainingSegments * 3`. This prunes entire subtrees immediately instead of discovering infeasibility only at the base case, meaningfully cutting wasted recursion for longer inputs.
**Complexity.** Letter Combinations: Time O(4^n · n), Space O(n) — unchanged, already optimal. Restore IP Addresses: Time O(1) bounded, but with fewer wasted recursive calls in practice due to the feasibility prune.
```java
import java.util.*;

class Solution {
    public List<String> restoreIpAddresses(String s) {
        List<String> result = new ArrayList<>();
        int n = s.length();
        if (n < 4 || n > 12) return result;
        backtrack(s, 0, 0, new ArrayDeque<>(), result);
        return result;
    }

    private void backtrack(String s, int start, int segCount, Deque<String> segments, List<String> result) {
        int n = s.length();
        int remainingSegments = 4 - segCount;
        int remainingChars = n - start;

        if (segCount == 4) {
            if (start == n) result.add(String.join(".", segments));
            return;
        }
        // prune: remaining chars must fit between the min and max the remaining segments can absorb
        if (remainingChars < remainingSegments || remainingChars > remainingSegments * 3) return;

        for (int len = 1; len <= 3 && start + len <= n; len++) {
            String segment = s.substring(start, start + len);
            if (!isValidSegment(segment)) continue;

            segments.addLast(segment);           // choose
            backtrack(s, start + len, segCount + 1, segments, result); // explore
            segments.removeLast();               // un-choose
        }
    }

    private boolean isValidSegment(String seg) {
        if (seg.length() > 1 && seg.charAt(0) == '0') return false;
        return Integer.parseInt(seg) <= 255;
    }
}
```

## Key Takeaways
- Both problems build a fixed-length output (4 letters for `digits.length==4`, always exactly 4 IP segments) via DFS across positions, making them a gentler introduction to backtracking than search-space problems with variable-length outputs.
- Letter Combinations has no invalid branches to prune — every root-to-leaf path is a valid answer, so the DFS tree size *is* the output size; there's nothing to optimize beyond direct enumeration.
- Restore IP Addresses' key validity rule is often mis-implemented: a segment with more than one digit and a leading `'0'` is invalid (e.g. `"01"`, `"00"`), but `"0"` alone is valid — always check length first before parsing to an int.
- The `remainingChars` bounds check (`remainingSegments <= remainingChars <= remainingSegments*3`) is a classic feasibility prune: computing a cheap necessary condition up front avoids descending into subtrees that can never succeed.
