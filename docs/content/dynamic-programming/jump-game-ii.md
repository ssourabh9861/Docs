# Jump Game II

**Difficulty:** Medium · **Pattern:** Greedy BFS-layer (implicit DP on min jumps) · [LeetCode](https://leetcode.com/problems/jump-game-ii/)

## Problem
Given an array `nums` where `nums[i]` is the maximum jump length from index `i`, return the minimum number of jumps needed to reach the last index, starting from index 0. It is guaranteed that you can always reach the last index.

## Examples
**Example 1**
```
Input:  nums = [2,3,1,1,4]
Output: 2
Explanation: Jump 1 step from index 0 to 1, then 3 steps to the last index (index 4).
```

**Example 2**
```
Input:  nums = [2,3,0,1,4]
Output: 2
```

## Constraints
- 1 <= nums.length <= 10^4
- 0 <= nums[i] <= 1000
- It is guaranteed that you can reach nums[n - 1].

## Approach 1 — DP Definition (for understanding)
**Idea.** Let `dp[i]` = minimum jumps to reach index `i` from index 0. `dp[0] = 0`. For every index `j` reachable from some `i < j` (i.e., `i + nums[i] >= j`), `dp[j] = min(dp[j], dp[i] + 1)`. This direct O(n^2) DP scans, for each `i`, all indices it can jump to and relaxes them — it explicitly matches the "min jumps to reach a state" recurrence before optimizing to the greedy layer approach below.

**Complexity.** Time O(n^2), Space O(n).
```java
import java.util.*;

class Solution {
    public int jump(int[] nums) {
        int n = nums.length;
        int[] dp = new int[n];
        Arrays.fill(dp, Integer.MAX_VALUE);
        dp[0] = 0;

        for (int i = 0; i < n; i++) {
            if (dp[i] == Integer.MAX_VALUE) continue;
            int farthest = Math.min(n - 1, i + nums[i]);
            for (int j = i + 1; j <= farthest; j++) {
                dp[j] = Math.min(dp[j], dp[i] + 1);
            }
        }
        return dp[n - 1];
    }
}
```

## Approach 2 — Greedy BFS-Layer (Optimal)
**Idea.** Think of jumps as BFS layers: from the current layer's reachable range `[curEnd's boundary]`, track the farthest index reachable using any index in the current layer. Iterate `i` from 0 to `n-2`, updating `farthest = max(farthest, i + nums[i])`. When `i` reaches `curEnd` (the end of the current layer, i.e., all positions reachable with the current jump count are exhausted), increment `jumps` and advance `curEnd = farthest` — this represents moving to the next BFS layer. This is equivalent to the DP above but processes each index once instead of re-relaxing ranges, dropping to linear time.

**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int jump(int[] nums) {
        int n = nums.length;
        int jumps = 0, curEnd = 0, farthest = 0;

        for (int i = 0; i < n - 1; i++) {
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

## Key Takeaways
- Min-jumps problems are BFS in disguise: each "layer" is the set of indices reachable with exactly `k` jumps.
- The greedy version tracks the frontier boundary (`curEnd`) and the next frontier's farthest reach (`farthest`) without ever storing per-index jump counts.
- Always verify with the O(n^2) DP mentally first — it makes the greedy's correctness (advancing exactly when the current layer is exhausted) much clearer.
