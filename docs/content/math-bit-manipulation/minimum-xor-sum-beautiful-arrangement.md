# Minimum XOR Sum of Two Arrays / Beautiful Arrangement

**Difficulty:** Hard · **Pattern:** bitmask DP over "which elements of the second array have been assigned so far" · [LeetCode](https://leetcode.com/problems/minimum-xor-sum-of-two-arrays/) / [LeetCode](https://leetcode.com/problems/beautiful-arrangement/)

## Problem
**Minimum XOR Sum**: given two integer arrays `nums1` and `nums2` of equal length `n`, find a permutation of `nums2` that minimizes `sum(nums1[i] XOR nums2[i] for i in 0..n-1)`; return that minimum sum.
**Beautiful Arrangement**: count how many permutations `perm` of `1..n` satisfy, for every index `i` (1-indexed), either `perm[i] % i == 0` or `i % perm[i] == 0`.

## Examples
**Example 1 (Minimum XOR Sum)**
```
Input:  nums1 = [1,2], nums2 = [2,3]
Output: 2
Explanation: Assign nums2 as [3,2]: (1^3) + (2^2) = 2 + 0 = 2, the minimum.
```

**Example 2 (Beautiful Arrangement)**
```
Input:  n = 2
Output: 2
Explanation: [1,2] and [2,1] both satisfy the divisibility condition at every position.
```

## Constraints
- Minimum XOR Sum: `n == nums1.length == nums2.length`, `1 <= n <= 14`, `0 <= nums1[i], nums2[i] <= 10^9`.
- Beautiful Arrangement: `1 <= n <= 15`.

## Approach 1 — Brute-force permutations (baseline, illustrates the search space)
**Idea.** Generate every permutation of the second array (or of `1..n`) and check the objective/condition directly. Correct but factorial time, useful only to establish what the bitmask DP is optimizing away.
**Complexity.** Time O(n! * n), Space O(n) recursion depth.
```java
import java.util.ArrayList;
import java.util.List;

class BruteForceBeautifulArrangement {
    private int count = 0;

    public int countArrangement(int n) {
        boolean[] used = new boolean[n + 1];
        backtrack(n, 1, used);
        return count;
    }

    private void backtrack(int n, int pos, boolean[] used) {
        if (pos > n) {
            count++;
            return;
        }
        for (int num = 1; num <= n; num++) {
            if (!used[num] && (num % pos == 0 || pos % num == 0)) {
                used[num] = true;
                backtrack(n, pos + 1, used);
                used[num] = false;
            }
        }
    }
}
```

## Approach 2 — Bitmask DP (optimal, both problems)
**Idea.** For n <= ~14-15, represent "which indices/values of the second sequence have already been used" as an n-bit mask (up to 2^n states). For **Minimum XOR Sum**: `dp[mask]` = minimum XOR sum achievable after assigning `popcount(mask)` elements of `nums1` (processed in fixed order 0, 1, 2, ...) to the `nums2` indices marked in `mask`. Transition: from `dp[mask]`, for every unset bit `j`, try assigning `nums2[j]` to `nums1[popcount(mask)]`, moving to `dp[mask | (1<<j)]`. For **Beautiful Arrangement**: `dp[mask]` = number of ways to have filled positions `1..popcount(mask)` using exactly the values marked in `mask`, transitioning by placing an unused value `num` at position `popcount(mask)+1` if the divisibility condition holds. Both are instances of the same "assignment problem" shape: process positions left to right, bitmask tracks which of the other array's elements/values are already consumed.
**Complexity.** Time O(2^n * n), Space O(2^n).
```java
class MinimumXorSumDP {
    public int minimumXORSum(int[] nums1, int[] nums2) {
        int n = nums1.length;
        int size = 1 << n;
        int[] dp = new int[size];
        java.util.Arrays.fill(dp, Integer.MAX_VALUE);
        dp[0] = 0;

        for (int mask = 0; mask < size; mask++) {
            if (dp[mask] == Integer.MAX_VALUE) continue;
            int i = Integer.bitCount(mask); // next index of nums1 to assign
            if (i == n) continue;
            for (int j = 0; j < n; j++) {
                if ((mask & (1 << j)) != 0) continue; // nums2[j] already used
                int nextMask = mask | (1 << j);
                int candidate = dp[mask] + (nums1[i] ^ nums2[j]);
                if (candidate < dp[nextMask]) {
                    dp[nextMask] = candidate;
                }
            }
        }
        return dp[size - 1];
    }
}
```
```java
class BeautifulArrangementDP {
    public int countArrangement(int n) {
        int size = 1 << n;
        int[] dp = new int[size];
        dp[0] = 1;

        for (int mask = 0; mask < size; mask++) {
            if (dp[mask] == 0) continue;
            int pos = Integer.bitCount(mask) + 1; // next position to fill
            if (pos > n) continue;
            for (int num = 1; num <= n; num++) {
                int bit = 1 << (num - 1);
                if ((mask & bit) != 0) continue; // num already used
                if (num % pos == 0 || pos % num == 0) {
                    dp[mask | bit] += dp[mask];
                }
            }
        }
        return dp[size - 1];
    }
}
```

## Key Takeaways
- Bitmask DP is the go-to technique for assignment-style problems with n up to ~15-20: the mask encodes "which elements/positions have been consumed" and `Integer.bitCount(mask)` recovers "how many steps in" you are, avoiding a separate loop variable.
- Both problems share the identical DP shape (fill positions 1..n in order, mask = used values), even though one minimizes a sum and the other counts valid assignments — recognizing this shape transfers directly between XOR-sum-matching and permutation-counting problems.
- Always initialize the DP array appropriately for the objective (`Integer.MAX_VALUE` for minimization, `0`/`1` for counting) and skip unreachable masks to save work.
- 2^n states * n transitions is dramatically better than n! permutations once n exceeds roughly 10-12.
