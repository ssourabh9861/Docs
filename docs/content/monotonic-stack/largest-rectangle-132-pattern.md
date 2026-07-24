# 132 Pattern

**Difficulty:** Hard (rated Medium on LeetCode) · **Pattern:** monotonic decreasing stack scanned right-to-left, tracking the best discarded "2" · [LeetCode](https://leetcode.com/problems/132-pattern/)

## Problem
Given an array `nums`, determine whether there exists a **132 pattern**: indices `i < j < k` such that `nums[i] < nums[k] < nums[j]`. (The name comes from the relative order "1 < 3, then 2" where "1"=`nums[i]`, "3"=`nums[j]`, "2"=`nums[k]`.)

## Examples
**Example 1**
```
Input:  nums = [1,2,3,4]
Output: false
Explanation: No triple satisfies nums[i] < nums[k] < nums[j].
```

**Example 2**
```
Input:  nums = [3,1,4,2]
Output: true
Explanation: i=1 (1), j=2 (4), k=3 (2): 1 < 2 < 4.
```

**Example 3**
```
Input:  nums = [-1,3,2,0]
Output: true
Explanation: i=0 (-1), j=1 (3), k=2 (2): -1 < 2 < 3.
```

## Constraints
- `n == nums.length`
- `1 <= n <= 2 * 10^4`
- `-10^9 <= nums[i] <= 10^9`

## Approach 1 — Brute Force
**Idea.** Try every triple `i < j < k` directly and check the condition.
**Complexity.** Time O(n^3), Space O(1). (A minor optimization tracks a running prefix min as "1" and checks pairs `j < k`, giving O(n^2).)
```java
class Solution {
    public boolean find132pattern(int[] nums) {
        int n = nums.length;
        for (int i = 0; i < n - 2; i++) {
            for (int j = i + 1; j < n - 1; j++) {
                if (nums[j] <= nums[i]) continue;
                for (int k = j + 1; k < n; k++) {
                    if (nums[k] > nums[i] && nums[k] < nums[j]) return true;
                }
            }
        }
        return false;
    }
}
```

## Approach 2 — Monotonic Stack from the Right (optimal)
**Idea.** Scan right to left. Maintain a monotonic **decreasing** stack of candidate "3" values, and track `third`, the largest value ever popped off the stack (this becomes a candidate "2", since it was smaller than something to its right that is still in play as a "3"). For the current element `nums[i]` (acting as candidate "1"): first pop everything smaller than `nums[i]` off the stack, updating `third` to the last (largest) popped value each time — if at any point `nums[i] < third`, we've found `i < j < k` with `nums[i] < nums[k] < nums[j]`, so return true. Otherwise push `nums[i]` onto the stack as a new candidate "3" for elements further left.
**Complexity.** Time O(n) — each element pushed and popped at most once, Space O(n).
```java
class Solution {
    public boolean find132pattern(int[] nums) {
        Deque<Integer> stack = new ArrayDeque<>(); // decreasing stack of candidate "3"s
        long third = Long.MIN_VALUE; // best candidate "2" found so far
        for (int i = nums.length - 1; i >= 0; i--) {
            if (nums[i] < third) return true; // nums[i] is a valid "1"
            while (!stack.isEmpty() && stack.peek() < nums[i]) {
                third = stack.pop(); // this popped value becomes candidate "2"
            }
            stack.push(nums[i]);
        }
        return false;
    }
}
```

## Key Takeaways
- Scanning right to left lets the stack represent "possible 3's" while a separate variable remembers the best "2" discarded so far — a variant of the monotonic stack pattern where the *popped* values matter more than the stack contents.
- `third` only ever increases as better "2" candidates are found, which is what makes checking `nums[i] < third` sufficient instead of needing to search the whole popped history.
- Easy sign trap: use a value like `Long.MIN_VALUE` (or `Integer.MIN_VALUE - 1L`) for the initial `third` so a legitimate very negative `nums[i]` isn't mistaken for a match.
- Related: Next Greater Element series and 496/503 share the "process from one side, stack tracks candidates" idea, though the "132" twist (using popped values) is unique to this problem and also appears in Largest Rectangle in Histogram in the sense that popped elements carry information used after removal.
