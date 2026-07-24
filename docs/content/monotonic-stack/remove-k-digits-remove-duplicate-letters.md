# Remove K Digits / Remove Duplicate Letters

**Difficulty:** Medium · **Pattern:** greedy monotonic stack build (pop while it improves lexicographic order) · [LeetCode](https://leetcode.com/problems/remove-k-digits/)

## Problem
Two sibling greedy-stack problems:
- **Remove K Digits** ([LC 402](https://leetcode.com/problems/remove-k-digits/)): given a non-negative integer as a string `num` and an integer `k`, remove `k` digits so the remaining digits (kept in order) form the smallest possible number, with no leading zeros.
- **Remove Duplicate Letters** ([LC 316](https://leetcode.com/problems/remove-duplicate-letters/), identical to [Smallest Subsequence of Distinct Characters, LC 1081](https://leetcode.com/problems/smallest-subsequence-of-distinct-characters/)): given a string `s`, remove duplicate letters so every letter appears exactly once, the result is the smallest possible in lexicographic order, and relative order of the remaining letters is preserved.

## Examples
**Example 1 (Remove K Digits)**
```
Input:  num = "1432219", k = 3
Output: "1219"
Explanation: Remove 4, 3, 2 (the first one) to leave the smallest number 1219.
```

**Example 2 (Remove K Digits)**
```
Input:  num = "10200", k = 1
Output: "200"
Explanation: Remove the leading '1'; leading zeros in "0200" are then stripped -> "200".
```

**Example 3 (Remove Duplicate Letters)**
```
Input:  s = "cbacdcbc"
Output: "acdb"
Explanation: Greedily keep the smallest possible letter at each position as long as its
remaining copies later in the string can still complete the alphabet.
```

## Constraints
- Remove K Digits: `1 <= k <= num.length <= 10^5`; `num` consists of digits only, no leading zeros unless `num == "0"`.
- Remove Duplicate Letters: `1 <= s.length <= 10^4`; `s` consists of lowercase English letters.

## Approach 1 — Brute Force
**Idea.** *Remove K Digits*: repeatedly scan left to right for the first "descent" (`num[i] > num[i+1]`) and delete `num[i]`; repeat `k` times. Each scan is O(n), done `k` times. *Remove Duplicate Letters*: try greedily building character by character, and for each candidate check via brute-force whether all remaining distinct letters can still appear later — this is essentially the same idea as the optimal approach but re-scanning from scratch instead of using precomputed "last occurrence" indices, which pushes it to O(26n) or worse if implemented naively.
**Complexity.** Remove K Digits: Time O(k * n), Space O(n). Remove Duplicate Letters (naive rescans): Time O(n^2), Space O(1) extra.

## Approach 2 — Greedy Monotonic Stack (optimal)
**Idea.**
- *Remove K Digits*: build the result on a stack. For each incoming digit, while the stack is non-empty, `k > 0`, and the top of the stack is **greater** than the current digit, pop it (removing a digit strictly decreases the number when it precedes a smaller digit — the classic monotonic increasing stack). Push the digit. If `k` digits still remain unused after the scan, they must come from the end (the string was already non-decreasing there), so trim from the right. Finally strip leading zeros and handle the empty-result case as `"0"`.
- *Remove Duplicate Letters*: precompute the last index of occurrence of every character. Scan left to right maintaining a stack of characters seen so far (each used at most once, tracked via a `seen` set). For each character, while the stack's top is greater than the current character, `seen` doesn't yet contain it removed permanently, and the top character occurs again later (`lastIndex[top] > i`), pop it from the stack and mark it unseen. Push the current character if not already on the stack.
**Complexity.** Both: Time O(n), Space O(n) (or O(26) extra for the alphabet-bounded stack in the second problem).
```java
// Remove K Digits — LC 402
class Solution {
    public String removeKdigits(String num, int k) {
        Deque<Character> stack = new ArrayDeque<>(); // front = bottom, back = top
        for (char c : num.toCharArray()) {
            while (k > 0 && !stack.isEmpty() && stack.peekLast() > c) {
                stack.pollLast();
                k--;
            }
            stack.addLast(c);
        }
        // remove any leftover digits from the end (string was non-decreasing there)
        while (k > 0 && !stack.isEmpty()) {
            stack.pollLast();
            k--;
        }
        StringBuilder sb = new StringBuilder();
        for (char c : stack) sb.append(c);
        // strip leading zeros
        int i = 0;
        while (i < sb.length() - 1 && sb.charAt(i) == '0') i++;
        String result = sb.substring(i);
        return result.isEmpty() ? "0" : result;
    }
}
```
```java
// Remove Duplicate Letters — LC 316 / 1081
class Solution {
    public String removeDuplicateLetters(String s) {
        int[] lastIndex = new int[26];
        for (int i = 0; i < s.length(); i++) lastIndex[s.charAt(i) - 'a'] = i;

        boolean[] onStack = new boolean[26];
        Deque<Character> stack = new ArrayDeque<>();

        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (onStack[c - 'a']) continue; // already included, skip duplicate
            while (!stack.isEmpty() && stack.peekLast() > c
                    && lastIndex[stack.peekLast() - 'a'] > i) {
                onStack[stack.pollLast() - 'a'] = false;
            }
            stack.addLast(c);
            onStack[c - 'a'] = true;
        }
        StringBuilder sb = new StringBuilder();
        for (char c : stack) sb.append(c);
        return sb.toString();
    }
}
```

## Key Takeaways
- Both problems build the answer greedily on a stack: pop the top while it's larger than the incoming character **and** popping is still legal (in Remove K Digits, `k > 0`; in Remove Duplicate Letters, the popped character still appears later so it can be re-added).
- Remove K Digits' "trim from the end if k remains" step is easy to forget — it's needed whenever the whole string is already non-decreasing.
- Remove Duplicate Letters adds an extra guard beyond a plain monotonic stack: never pop a character that has no later occurrence, since that would remove it permanently.
- Related: Create Maximum Number (merges this greedy-stack idea with a k-way merge), 316/1081 are literally the same problem under two numbers.
