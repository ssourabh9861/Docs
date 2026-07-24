# Replace the Substring for Balanced String

**Difficulty:** Hard · **Pattern:** Minimum-window shrink over the complement of a fixed replaceable substring · [LeetCode](https://leetcode.com/problems/replace-the-substring-for-balanced-string/)

## Problem
A string of length `n` made only of 'Q', 'W', 'E', 'R' is "balanced" if each character appears exactly `n/4` times. Given such a string `s`, find the minimum length of a substring you can replace (with any characters) so that the resulting string is balanced.

## Examples
**Example 1**
```
Input:  s = "QWER"
Output: 0
Explanation: s is already balanced.
```
**Example 2**
```
Input:  s = "QQWE"
Output: 1
Explanation: Replace the second 'Q' with 'R', making "QRWE" balanced.
```
**Example 3**
```
Input:  s = "QQQW"
Output: 2
Explanation: Replace the two extra 'Q's, e.g. with 'E' and 'R', to get a balanced string.
```

## Constraints
- `n == s.length`
- `4 <= n <= 10^5`
- `n` is a multiple of 4.
- `s` contains only the letters 'Q', 'W', 'E', and 'R'.

## Approach 1 — Brute Force
**Idea.** For every possible substring `[i, j]`, compute the character counts of `s` outside that substring and check whether every remaining character count is `<= n/4` (meaning replacing `[i, j]` with the right characters can balance it). Track the minimum valid length.
**Complexity.** Time O(n³) (O(n²) substrings, O(n) count check each), Space O(1).
```java
class Solution {
    public int balancedString(String s) {
        int n = s.length(), target = n / 4;
        int minLen = n;
        for (int i = 0; i < n; i++) {
            for (int j = i; j < n; j++) {
                int[] count = new int[128];
                for (int k = 0; k < n; k++) {
                    if (k < i || k > j) count[s.charAt(k)]++;
                }
                if (count['Q'] <= target && count['W'] <= target &&
                    count['E'] <= target && count['R'] <= target) {
                    minLen = Math.min(minLen, j - i + 1);
                }
            }
        }
        return minLen;
    }
}
```

## Approach 2 — Sliding Window Minimizing the Replaced Region (optimal)
**Idea.** A substring `[left, right]` is a valid candidate to replace iff, once removed, every character's remaining count outside the window is `<= n/4` (the replaced part can then be filled with whatever is missing to reach `n/4` each). Compute the total frequency of each character in `s`. Expand `right`, decrementing the count of `s[right]` (as if removing it from "outside" counts, since it's now inside the window candidate). Once all four counts (outside the window) are `<= target`, the window is valid — try shrinking `left` to minimize it while it remains valid, restoring counts as elements leave the window.
**Complexity.** Time O(n) — two pointers each move forward at most n times, Space O(1) (4-character alphabet).
```java
class Solution {
    public int balancedString(String s) {
        int n = s.length();
        int target = n / 4;
        int[] count = new int[128];
        for (int i = 0; i < n; i++) count[s.charAt(i)]++;

        // already balanced
        if (count['Q'] == target && count['W'] == target &&
            count['E'] == target && count['R'] == target) {
            return 0;
        }

        int left = 0, minLen = n;
        for (int right = 0; right < n; right++) {
            count[s.charAt(right)]--; // remove from "outside" count (it's now inside window)

            while (left <= right && isBalanced(count, target)) {
                minLen = Math.min(minLen, right - left + 1);
                count[s.charAt(left)]++; // shrink: put char back to "outside"
                left++;
            }
        }
        return minLen;
    }

    private boolean isBalanced(int[] count, int target) {
        return count['Q'] <= target && count['W'] <= target &&
               count['E'] <= target && count['R'] <= target;
    }
}
```

## Key Takeaways
- This is a "minimum window" problem in reverse: instead of finding the smallest window that *contains* enough of something, you find the smallest window whose *removal* makes the remainder balanced — the remaining outside-counts must all be `<= n/4`.
- Classic trap: checking balance based on counts *inside* the window instead of *outside* — the window is the part being discarded/replaced, so the invariant to satisfy is about what's left over, not what's captured.
- Related problems: Minimum Window Substring, Minimum Size Subarray Sum, Grumpy Bookstore Owner (similar "window improves the rest of the array" framing).
