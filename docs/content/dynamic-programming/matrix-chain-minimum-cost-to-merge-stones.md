# Matrix Chain / Minimum Cost to Merge Stones

**Difficulty:** Hard · **Pattern:** Interval DP with a split-point choice (classical matrix-chain style), generalized to K-way merges · [LeetCode](https://leetcode.com/problems/minimum-cost-to-merge-stones/)

## Problem
This entry covers two closely related interval-DP problems that share the same "choose where to split" backbone:
- **Matrix Chain Multiplication** (classical, not on LeetCode): given matrix dimensions, order the multiplications to minimize total scalar multiplications.
- **Minimum Cost to Merge Stones** (LeetCode Hard): given `stones[i]` piles, you may merge exactly `K` *consecutive* piles into one pile at a cost equal to their total stone count. Return the minimum total cost to merge everything into one pile, or `-1` if impossible.

## Examples
**Example 1 (Merge Stones)**
```
Input:  stones = [3,2,4,1], K = 2
Output: 20
Explanation: [3,2,4,1] --(3+2)--> [5,4,1] --(4+1)--> [5,5] --(5+5)--> [10]; cost 5+5+10 = 20.
```
**Example 2 (Merge Stones, impossible)**
```
Input:  stones = [3,5,1,2,6], K = 3
Output: 25
Explanation: (n-1) % (K-1) == 4 % 2 == 0, so it is possible; optimal merges total 25.
```

## Constraints
- `n == stones.length`
- `1 <= n <= 30`
- `2 <= K <= 30`
- `1 <= stones[i] <= 100`

## Approach 1 — Warm-up: K = 2 as classical matrix-chain DP
**Idea.** When `K = 2`, every merge combines exactly two adjacent piles, so the problem is structurally identical to Matrix Chain Multiplication: choose a split point `k` inside `[i, j]`, solve the two halves independently, and pay a "combine" cost for joining them (here, `sum(i, j)`, the total stones — since any way of merging `[i,j]` down to one pile always costs the same *final* combine amount, only the split order affects the cost of intermediate combines). `dp[i][j] = min over k in [i, j-1]` of `dp[i][k] + dp[k+1][j] + sum(i, j)`, memoized top-down.
**Complexity.** Time O(n³), Space O(n²).
```java
class Solution {
    private long[][] memo;
    private int[] prefix;

    public int mergeStonesK2(int[] stones) {
        int n = stones.length;
        prefix = new int[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + stones[i];
        memo = new long[n][n];
        for (long[] row : memo) Arrays.fill(row, -1);
        return (int) solve(0, n - 1);
    }

    private long solve(int i, int j) {
        if (i == j) return 0;
        if (memo[i][j] != -1) return memo[i][j];
        long best = Long.MAX_VALUE;
        for (int k = i; k < j; k++) {
            best = Math.min(best, solve(i, k) + solve(k + 1, j));
        }
        return memo[i][j] = best + (prefix[j + 1] - prefix[i]);
    }
}
```
*(add `import java.util.Arrays;`)*

## Approach 2 — General K-way merge DP with divisibility check (optimal)
**Idea.** For general `K`, merging is only possible if `(n - 1) % (K - 1) == 0` (each merge reduces the pile count by `K - 1`, so the total reduction `n - 1` must be a multiple of that). Define `dp[i][j]` as the minimum cost to reduce `stones[i..j]` down to the fewest piles reachable *without* necessarily forming a single pile. Split at points `i, i+(K-1), i+2(K-1), ...` — only these offsets can leave clean groups of `K` — and combine: `dp[i][j] = min over such mid of dp[i][mid] + dp[mid+1][j]`. If additionally `(j - i) % (K - 1) == 0`, the resulting `K` piles inside `[i,j]` can themselves be merged into one, so add `sum(i, j)` to `dp[i][j]`.
**Complexity.** Time O(n³ / K), Space O(n²).
```java
class Solution {
    public int mergeStones(int[] stones, int K) {
        int n = stones.length;
        if ((n - 1) % (K - 1) != 0) return -1;

        int[] prefix = new int[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + stones[i];

        int[][] dp = new int[n][n];
        for (int len = K; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                dp[i][j] = Integer.MAX_VALUE;
                for (int mid = i; mid < j; mid += K - 1) {
                    dp[i][j] = Math.min(dp[i][j], dp[i][mid] + dp[mid + 1][j]);
                }
                if ((len - 1) % (K - 1) == 0) {
                    dp[i][j] += prefix[j + 1] - prefix[i];
                }
            }
        }
        return dp[0][n - 1];
    }
}
```

## Key Takeaways
- The feasibility check `(n - 1) % (K - 1) == 0` must be verified before running the DP — without it the recurrence silently produces a wrong (finite) answer for infeasible inputs.
- Splitting only at offsets that are multiples of `(K - 1)` away from `i` is what keeps groups "clean" for eventual K-way merging; splitting anywhere else would leave un-mergeable leftover piles.
- `dp[i][j]` represents cost to reduce to the *minimum reachable* pile count, not necessarily 1 — the extra `sum(i, j)` term is only added when a final full merge is actually possible for that sub-range.
