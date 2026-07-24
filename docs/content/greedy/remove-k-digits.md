# Remove K Digits

**Difficulty:** Medium · **Pattern:** monotonic stack greedy · [LeetCode](https://leetcode.com/problems/remove-k-digits/)

## Problem
Given a non-negative integer as a string `num` and an integer `k`, remove `k` digits from `num` so that the resulting number is the smallest possible, and return it as a string (with no leading zeros, or `"0"` if the result is empty/all zeros).

## Examples
**Example 1**
```
Input:  num = "1432219", k = 3
Output: "1219"
Explanation: Removing 4, 3, and 2 gives the smallest possible number "1219".
```

**Example 2**
```
Input:  num = "10200", k = 1
Output: "200"
Explanation: Removing the leading 1 gives "0200"; stripping leading zeros gives "200".
```

## Constraints
- `1 <= k <= num.length <= 10^5`
- `num` consists of digits only and has no leading zeros (unless it's exactly "0").

## Approach 1 — Monotonic Increasing Stack
**Idea.** To make the number smallest, we want smaller digits as far left as possible. Process digits left to right maintaining a stack that stays non-decreasing from bottom to top: before pushing the current digit, while the stack's top digit is *greater* than the current digit and we still have removals left (`k > 0`), pop it — a larger digit sitting before a smaller one always makes the number bigger, so removing it strictly improves the result (exchange argument: swapping "keep the bigger digit" for "remove it" never increases, and strictly decreases, the numeric value). After the scan, if `k` removals remain unused, remove from the end (the largest remaining suffix contributes the least benefit to removing early positions). Finally strip leading zeros and handle the empty-result edge case.
**Complexity.** Time O(n), Space O(n).
```java
class Solution {
    public String removeKdigits(String num, int k) {
        Deque<Character> stack = new ArrayDeque<>();
        for (char c : num.toCharArray()) {
            while (k > 0 && !stack.isEmpty() && stack.peekLast() > c) {
                stack.pollLast();
                k--;
            }
            stack.addLast(c);
        }

        // remove any remaining k from the end (stack is non-decreasing, so end is largest)
        while (k > 0 && !stack.isEmpty()) {
            stack.pollLast();
            k--;
        }

        StringBuilder sb = new StringBuilder();
        for (char c : stack) sb.append(c);

        int start = 0;
        while (start < sb.length() - 1 && sb.charAt(start) == '0') start++;
        String result = sb.substring(start);
        return result.isEmpty() ? "0" : result;
    }
}
```

## Approach 2 — Brute Force Combination Check (Baseline)
**Idea.** Try every way of choosing `n - k` digits to keep (preserving relative order), compute the resulting number, and track the minimum. This confirms correctness by exhaustive search but is exponential — it exists only to justify that the monotonic-stack result matches the true optimum on small cases; it does not scale to the actual constraints.
**Complexity.** Time O(C(n, n-k) * n) exponential, Space O(n).
```java
class Solution {
    public String removeKdigits(String num, int k) {
        int n = num.length();
        int keep = n - k;
        if (keep <= 0) return "0";
        String best = null;
        int[] indices = new int[keep];
        best = bruteForceHelper(num, 0, 0, new StringBuilder(), keep, best);
        return best == null ? "0" : best;
    }

    private String bruteForceHelper(String num, int pos, int chosen, StringBuilder cur, int keep, String best) {
        if (chosen == keep) {
            int start = 0;
            while (start < cur.length() - 1 && cur.charAt(start) == '0') start++;
            String candidate = cur.substring(start);
            if (candidate.isEmpty()) candidate = "0";
            if (best == null || compareNumeric(candidate, best) < 0) best = candidate;
            return best;
        }
        if (num.length() - pos < keep - chosen) return best; // not enough digits left
        for (int i = pos; i <= num.length() - (keep - chosen); i++) {
            cur.append(num.charAt(i));
            best = bruteForceHelper(num, i + 1, chosen + 1, cur, keep, best);
            cur.deleteCharAt(cur.length() - 1);
        }
        return best;
    }

    private int compareNumeric(String a, String b) {
        if (a.length() != b.length()) return a.length() - b.length();
        return a.compareTo(b);
    }
}
```

## Key Takeaways
- Greedy choice: whenever the top of the stack is larger than the incoming digit and removals remain, pop it — a locally larger-then-smaller pattern always hurts the final value, so removing the larger digit is safe and necessary.
- The final non-decreasing stack means any leftover removal budget should be spent trimming the (largest-valued) tail, not the front.
- Leading-zero stripping and the "empty result becomes 0" rule are easy to miss edge cases — always apply them after the stack pass, not during it.
