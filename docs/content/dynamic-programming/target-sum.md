# Target Sum

**Difficulty:** Medium · **Pattern:** 0/1 Knapsack — transform +/- assignment into subset-sum counting · [LeetCode](https://leetcode.com/problems/target-sum/)

## Problem
Given an integer array `nums` and an integer `target`, assign either `+` or `-` to each element and count the number of ways to reach exactly `target` after summing.

## Examples
**Example 1**
```
Input:  nums = [1,1,1,1,1], target = 3
Output: 5
Explanation: Five sign assignments sum to 3, e.g. -1+1+1+1+1 = 3, +1-1+1+1+1 = 3, etc.
```

**Example 2**
```
Input:  nums = [1], target = 1
Output: 1
```

## Constraints
- 1 <= nums.length <= 20
- 0 <= nums[i] <= 1000
- 0 <= sum(nums[i]) <= 1000
- -1000 <= target <= 1000

## Approach 1 — Recurrence Insight: Transform to Subset Sum
**Idea.** Split `nums` into a positive subset `P` (assigned `+`) and negative subset `N` (assigned `-`). Then `sum(P) - sum(N) = target` and `sum(P) + sum(N) = totalSum`. Adding these: `2*sum(P) = target + totalSum`, so `sum(P) = (target + totalSum) / 2`. This must be a non-negative integer `<= totalSum`, otherwise answer is 0. The problem becomes: count subsets of `nums` that sum to `newTarget = (target + totalSum) / 2` — a 0/1 knapsack **counting** variant. Define `dp[s]` = number of subsets summing to `s`; recurrence per item `val`: `dp[s] += dp[s - val]` (processed backward to keep 0/1 semantics), starting from `dp[0] = 1`.

**Complexity.** Time O(n * newTarget), Space O(newTarget).
```java
class Solution {
    public int findTargetSumWays(int[] nums, int target) {
        int total = 0;
        for (int x : nums) total += x;

        if (Math.abs(target) > total) return 0;
        if ((target + total) % 2 != 0) return 0;

        int newTarget = (target + total) / 2;
        if (newTarget < 0) return 0;

        int[] dp = new int[newTarget + 1];
        dp[0] = 1;

        for (int val : nums) {
            for (int s = newTarget; s >= val; s--) {
                dp[s] += dp[s - val];
            }
        }
        return dp[newTarget];
    }
}
```

## Approach 2 — Direct Top-Down Memoization (No Transform)
**Idea.** Alternatively, define `f(i, curSum)` = number of ways to assign signs to `nums[i..n-1]` such that the total (added to what's already been fixed) reaches `target`. State: index `i` and running sum `curSum`. Recurrence: `f(i, curSum) = f(i+1, curSum + nums[i]) + f(i+1, curSum - nums[i])`, base case `f(n, curSum) = 1 if curSum == target else 0`. This is more general and doesn't need the subset-sum algebra, but has a larger effective state space (sum can range over `[-1000, 1000]`), so memoize with a map or offset array.

**Complexity.** Time O(n * range), Space O(n * range) where range is bounded by 2*totalSum+1.
```java
import java.util.*;

class Solution {
    private Map<String, Integer> memo = new HashMap<>();
    private int[] nums;
    private int target;

    public int findTargetSumWays(int[] nums, int target) {
        this.nums = nums;
        this.target = target;
        return f(0, 0);
    }

    private int f(int i, int curSum) {
        if (i == nums.length) {
            return curSum == target ? 1 : 0;
        }
        String key = i + "," + curSum;
        if (memo.containsKey(key)) return memo.get(key);

        int ways = f(i + 1, curSum + nums[i]) + f(i + 1, curSum - nums[i]);
        memo.put(key, ways);
        return ways;
    }
}
```

## Key Takeaways
- Recognize the algebraic transform: "+/- assignment reaching target" is equivalent to "count subsets summing to (target + total) / 2" — a very common trick that turns a signed-assignment problem into standard 0/1 knapsack counting.
- Parity check (`target + total` must be even) and range check (`|target| <= total`) are necessary feasibility guards before running the DP.
- The direct memoized recursion is more intuitive but has a larger state space; the subset-sum transform is strictly more efficient here.
