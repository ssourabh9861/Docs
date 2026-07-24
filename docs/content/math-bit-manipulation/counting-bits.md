# Counting Bits

**Difficulty:** Medium · **Pattern:** DP recurrence `dp[i] = dp[i >> 1] + (i & 1)` reusing previously computed popcounts · [LeetCode](https://leetcode.com/problems/counting-bits/)

## Problem
Given an integer `n`, return an array `ans` of length `n + 1` where `ans[i]` is the number of 1-bits in the binary representation of `i`, for every `i` from 0 to `n`.

## Examples
**Example 1**
```
Input:  n = 2
Output: [0,1,1]
Explanation: 0 -> 0, 1 -> 1, 2 -> 10 -> 1
```

**Example 2**
```
Input:  n = 5
Output: [0,1,1,2,1,2]
Explanation: 0,1,1,2(=10b),1(=100b),2(=101b)
```

## Constraints
- 0 <= n <= 10^5
- Follow-up: solve in O(n) total time, ideally without using a built-in popcount function, and in a single pass with O(n) extra space only for the output.

## Approach 1 — Built-in popcount per number (baseline)
**Idea.** For each `i` from 0 to `n`, call `Integer.bitCount(i)` (or manually strip the lowest set bit with `i & (i-1)` in a loop) to count its set bits directly. Correct and simple, but does O(log i) work per element without reusing prior results.
**Complexity.** Time O(n log n) worst case (or O(n) if relying on the JIT-optimized intrinsic, but conceptually per-element work), Space O(n) for the output.
```java
class SolutionBaseline {
    public int[] countBits(int n) {
        int[] ans = new int[n + 1];
        for (int i = 0; i <= n; i++) {
            ans[i] = Integer.bitCount(i);
        }
        return ans;
    }
}
```

## Approach 2 — DP with `i >> 1` and `i & 1` (optimal)
**Idea.** Every integer `i` can be split into "all bits except the last" (`i >> 1`) plus "the last bit" (`i & 1`). The popcount of `i` therefore equals the popcount of `i >> 1` (already computed, since `i >> 1 < i`) plus whether the last bit is set. This gives an O(1)-per-element recurrence filled left to right in one pass.
**Complexity.** Time O(n), Space O(n) for the output (O(1) extra beyond it).
```java
class SolutionOptimal {
    public int[] countBits(int n) {
        int[] dp = new int[n + 1];
        for (int i = 1; i <= n; i++) {
            dp[i] = dp[i >> 1] + (i & 1);
        }
        return dp;
    }
}
```

## Key Takeaways
- `dp[i] = dp[i >> 1] + (i & 1)` is the canonical O(n) recurrence: strip the last bit, reuse the answer for the remaining prefix.
- An alternative equally valid recurrence is `dp[i] = dp[i & (i-1)] + 1`, which strips the *lowest set bit* instead of the last bit — both run in O(n).
- Recognizing "this subproblem is a smaller instance already computed" is the key DP insight even for a problem that looks purely bit-twiddling.
- Avoid recomputing popcount from scratch per number when a running table can answer it in O(1).
