# Two City Scheduling

**Difficulty:** Medium · **Pattern:** sort-by-difference greedy · [LeetCode](https://leetcode.com/problems/two-city-scheduling/)

## Problem
Given `costs[i] = [aCost, bCost]` for `2n` people, where exactly `n` people must fly to city A and `n` to city B, return the minimum total cost to send everyone.

## Examples
**Example 1**
```
Input:  costs = [[10,20],[30,200],[400,50],[30,20]]
Output: 110
Explanation: Person 0 -> A (10), person 1 -> A (30), person 2 -> B (50), person 3 -> B (20). Total = 10+30+50+20 = 110.
```

**Example 2**
```
Input:  costs = [[259,770],[448,54],[926,667],[184,139],[840,118],[577,469]]
Output: 1859
Explanation: Sorting by (costA - costB) and sending the first half to A, second half to B minimizes the total.
```

## Constraints
- `2n == costs.length`
- `2 <= costs.length <= 200`
- `costs.length` is even.
- `1 <= aCost_i, bCost_i <= 1000`

## Approach 1 — Sort by Cost Difference
**Idea.** Send everyone to city A by default, paying `sum(aCost)`. For each person, switching them to city B instead changes the total by `bCost - aCost`. We must switch exactly `n` people. To minimize total cost, switch the `n` people with the *smallest* `(aCost - bCost)` — equivalently the most negative "savings" from switching — since those give the cheapest possible reduction. Sorting all people by `aCost - bCost` ascending and sending the first `n` to A, the rest to B, achieves exactly this: the first `n` are the ones where A is relatively cheapest compared to B, and the remaining `n` are where B is relatively cheapest. This is an exchange argument — if any pair were swapped from this order, the total cost could only increase or stay the same, since sorted order picks the globally cheapest set of switches.
**Complexity.** Time O(n log n), Space O(1) extra (excluding sort).
```java
class Solution {
    public int twoCitySchedCost(int[][] costs) {
        Arrays.sort(costs, (a, b) -> (a[0] - a[1]) - (b[0] - b[1]));

        int n = costs.length / 2;
        int total = 0;
        for (int i = 0; i < costs.length; i++) {
            total += (i < n) ? costs[i][0] : costs[i][1];
        }
        return total;
    }
}
```

## Approach 2 — DP Baseline (Knapsack-Style)
**Idea.** `dp[i][j]` = minimum cost considering the first `i` people with `j` of them already assigned to city A. For each person, choose `min(dp[i-1][j-1] + aCost, dp[i-1][j] + bCost)` subject to feasibility (`j <= n` and `(i-j) <= n`). This explores every possible split explicitly and confirms optimality, but at higher cost — it doesn't exploit the fact that the optimal assignment is fully determined by sorting on the cost difference.
**Complexity.** Time O(n^2), Space O(n) with rolling array.
```java
class Solution {
    public int twoCitySchedCost(int[][] costs) {
        int total = costs.length;
        int n = total / 2;
        int[][] dp = new int[total + 1][n + 1];
        for (int[] row : dp) Arrays.fill(row, Integer.MAX_VALUE / 2);
        dp[0][0] = 0;

        for (int i = 1; i <= total; i++) {
            int[] cost = costs[i - 1];
            for (int j = 0; j <= Math.min(i, n); j++) {
                int best = Integer.MAX_VALUE / 2;
                if (j > 0) best = Math.min(best, dp[i - 1][j - 1] + cost[0]); // send to A
                if (i - j <= n) best = Math.min(best, dp[i - 1][j] + cost[1]); // send to B
                dp[i][j] = best;
            }
        }
        return dp[total][n];
    }
}
```

## Key Takeaways
- Greedy choice: rank people by how much cheaper A is relative to B (`aCost - bCost`), then send the half where A is relatively cheapest to A, and the rest to B.
- The sort-by-difference trick collapses an apparent combinatorial assignment problem into an O(n log n) solution because the marginal benefit of switching someone's city is independent and additive.
- The DP baseline is more general (handles unequal group-size constraints or weighted variants) but is unnecessary here since the balanced-split structure is exactly solved by sorting.
