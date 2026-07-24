# Jump Game II

**Difficulty:** Medium · **Pattern:** greedy reach / implicit BFS layering · [LeetCode](https://leetcode.com/problems/jump-game-ii/)

## Problem
Given an array `nums` where `nums[i]` is the max jump length from index `i`, return the minimum number of jumps to reach the last index, assuming it is always reachable.

## Examples
**Example 1**
```
Input:  nums = [2,3,1,1,4]
Output: 2
Explanation: Jump 1 step from index 0 to 1, then 3 steps to the last index.
```

**Example 2**
```
Input:  nums = [2,3,0,1,4]
Output: 2
Explanation: Jump from index 0 to 1 (reach 4), then to the end.
```

## Constraints
- `1 <= nums.length <= 10^4`
- `0 <= nums[i] <= 1000`
- It is guaranteed that you can reach `nums.length - 1`.

## Approach 1 — Greedy BFS Layers (Reach Tracking)
**Idea.** Think of the array as levels of a BFS: `curEnd` marks the farthest index reachable using the jumps counted so far, and `farthest` tracks the farthest index reachable using one more jump from anywhere in the current layer. Scan indices; whenever `i == curEnd`, we must have used another jump to have gotten this far, so increment jumps and set `curEnd = farthest`. This is greedy because at each layer we never commit to a specific jump — we keep the option that maximizes future reach, which dominates any less-reaching choice (an exchange argument: replacing a shorter jump with the farthest-reaching one can only help or tie).
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int jump(int[] nums) {
        int jumps = 0, curEnd = 0, farthest = 0;
        for (int i = 0; i < nums.length - 1; i++) {
            farthest = Math.max(farthest, i + nums[i]);
            if (i == curEnd) {
                jumps++;
                curEnd = farthest;
            }
        }
        return jumps;
    }
}
```

## Approach 2 — Bottom-Up DP Baseline
**Idea.** `dp[i]` = minimum jumps to reach index `i`. For each `i`, try all `j < i` with `j + nums[j] >= i` and take `dp[j] + 1`. Correct but explores every reachable predecessor instead of only the farthest one, so it establishes correctness at higher cost — useful to see why the greedy shortcut (always taking the maximal reach) is safe.
**Complexity.** Time O(n^2), Space O(n).
```java
class Solution {
    public int jump(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        Arrays.fill(dp, Integer.MAX_VALUE);
        dp[0] = 0;
        for (int i = 1; i < n; i++) {
            for (int j = 0; j < i; j++) {
                if (dp[j] != Integer.MAX_VALUE && j + nums[j] >= i) {
                    dp[i] = Math.min(dp[i], dp[j] + 1);
                    break; // first reachable j with min dp[j] scanned in order suffices for correctness here
                }
            }
        }
        return dp[n - 1];
    }
}
```

## Key Takeaways
- Greedy choice: always extend to the farthest reachable index within the current "jump budget" layer — never take a smaller jump when a farther one is available, since it can only equal or beat it.
- The BFS-layer framing (`curEnd`/`farthest`) turns an O(n^2) DP into O(n) by never re-examining committed jumps.
- Increment the jump counter lazily, only when the current index forces it (`i == curEnd`), avoiding an off-by-one at the last index.
