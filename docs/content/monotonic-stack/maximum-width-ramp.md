# Maximum Width Ramp

**Difficulty:** Hard (rated Medium on LeetCode) · **Pattern:** monotonic decreasing stack of candidate left endpoints, scanned from the right · [LeetCode](https://leetcode.com/problems/maximum-width-ramp/)

## Problem
A **ramp** is a pair of indices `(i, j)` with `i < j` and `nums[i] <= nums[j]`. Find the maximum width `j - i` among all ramps in the array. Return 0 if no ramp exists.

## Examples
**Example 1**
```
Input:  nums = [6,0,8,2,1,5]
Output: 4
Explanation: The ramp (1,5) has nums[1]=0 <= nums[5]=5, width 5-1=4.
```

**Example 2**
```
Input:  nums = [9,8,1,0,1,9,4,0,4,1]
Output: 7
Explanation: The ramp (2,9) has nums[2]=1 <= nums[9]=1, width 9-2=7.
```

## Constraints
- `2 <= nums.length <= 5 * 10^4`
- `0 <= nums[i] <= 5 * 10^4`

## Approach 1 — Brute Force
**Idea.** Check every pair `i < j` for `nums[i] <= nums[j]` and track the max `j - i`.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int maxWidthRamp(int[] nums) {
        int n = nums.length, best = 0;
        for (int i = 0; i < n; i++) {
            for (int j = n - 1; j > i; j--) {
                if (nums[i] <= nums[j]) {
                    best = Math.max(best, j - i);
                    break; // widest j for this i is the first one found scanning from the end
                }
            }
        }
        return best;
    }
}
```

## Approach 2 — Monotonic Stack (optimal)
**Idea.** Only indices that are smaller than everything before them can ever be the *left* endpoint of the widest ramp — if `nums[a] >= nums[b]` for `a < b`, then any ramp usable with `b` as the left endpoint is at least as good with `a` instead (wider, and `nums[a] >= nums[b]` still permits it). So build a stack of indices with **strictly decreasing** values while scanning left to right — these are exactly the useful candidate left endpoints. Then scan right to left as the candidate right endpoint `j`: while the stack is non-empty and `nums[stack.top()] <= nums[j]`, pop it and update the best width `j - index`. Because we scan `j` from the largest index down, the first time an index qualifies as a left endpoint for some `j`, that `j` is the widest possible for it.
**Complexity.** Time O(n) — each index pushed and popped at most once, Space O(n).
```java
class Solution {
    public int maxWidthRamp(int[] nums) {
        int n = nums.length;
        Deque<Integer> stack = new ArrayDeque<>(); // indices, values strictly decreasing
        for (int i = 0; i < n; i++) {
            if (stack.isEmpty() || nums[stack.peek()] > nums[i]) {
                stack.push(i);
            }
        }
        int best = 0;
        for (int j = n - 1; j >= 0; j--) {
            while (!stack.isEmpty() && nums[stack.peek()] <= nums[j]) {
                best = Math.max(best, j - stack.pop());
            }
        }
        return best;
    }
}
```

## Key Takeaways
- The stack is built purely from a "could ever be useful as a left endpoint" filter (strictly decreasing prefix minima by index), independent of any right endpoint.
- Pairing that filtered candidate stack with a right-to-left scan for the right endpoint is a reusable two-pass template distinct from the classic previous/next-smaller-element scans.
- Popping (rather than just peeking) when `nums[stack.top()] <= nums[j]` is safe because a later (smaller) `j'` can never produce a wider ramp than the current `j` for that same index.
- Related: Best Time to Buy and Sell Stock (same "widest/best gap with value constraint" flavor solved differently), Number of Visible People in a Queue (also filters to a monotonic candidate set before pairing).
