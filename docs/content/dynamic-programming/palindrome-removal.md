# Palindrome Removal

**Difficulty:** Very Hard · **Pattern:** Interval DP with a "merge across matching ends" transition · [LeetCode](https://leetcode.com/problems/palindrome-removal/)

## Problem
Given an integer array `arr`, in each move you may remove a contiguous palindromic subarray. Return the minimum number of moves needed to remove the entire array.

## Examples
**Example 1**
```
Input:  arr = [1,2]
Output: 2
Explanation: No non-trivial palindromic subarray exists, so remove [1] then [2].
```
**Example 2**
```
Input:  arr = [1,3,4,1,5]
Output: 3
Explanation: Remove [4] -> [1,3,1,5] -> remove [1,3,1] -> [5] -> remove [5]. 3 moves.
```

## Constraints
- `1 <= arr.length <= 100`
- `1 <= arr[i] <= 20`

## Approach 1 — Top-down memoized recursion
**Idea.** Define `dp[i][j]` as the minimum moves to clear the subarray `arr[i..j]`. A single element costs 1 move. Otherwise, either peel off `arr[i]` alone (`dp[i+1][j] + 1`), or, if `arr[i] == arr[i+1]`, merge it away with its neighbor (`dp[i+2][j] + 1`), or — the key idea — look for any later index `k` with `arr[k] == arr[i]`: first clear the strictly-inner segment `arr[i+1..k-1]`, which leaves `arr[i]` and `arr[k]` adjacent and removable together in whatever move clears the rest, i.e. `dp[i+1][k-1] + dp[k+1][j]`. Take the minimum over all such choices, memoized by `(i, j)`.
**Complexity.** Time O(n³), Space O(n²).
```java
class Solution {
    private int[][] memo;
    private int[] arr;

    public int minimumMoves(int[] arr) {
        this.arr = arr;
        int n = arr.length;
        memo = new int[n][n];
        for (int[] row : memo) Arrays.fill(row, -1);
        return solve(0, n - 1);
    }

    private int solve(int i, int j) {
        if (i > j) return 0;
        if (i == j) return 1;
        if (memo[i][j] != -1) return memo[i][j];

        int best = solve(i + 1, j) + 1;
        if (arr[i] == arr[i + 1]) {
            best = Math.min(best, solve(i + 2, j) + 1);
        }
        for (int k = i + 2; k <= j; k++) {
            if (arr[k] == arr[i]) {
                best = Math.min(best, solve(i + 1, k - 1) + solve(k + 1, j));
            }
        }
        return memo[i][j] = best;
    }
}
```
*(add `import java.util.Arrays;`)*

## Approach 2 — Bottom-up interval DP (optimal ordering)
**Idea.** Same recurrence as Approach 1, but filled iteratively by increasing subarray length so every dependency (`dp[i+1][j]`, `dp[i+2][j]`, `dp[i+1][k-1]`, `dp[k+1][j]`) is already resolved before it is needed. This removes recursion overhead and stack-depth risk for `n` up to 100.
**Complexity.** Time O(n³), Space O(n²).
```java
class Solution {
    public int minimumMoves(int[] arr) {
        int n = arr.length;
        int[][] dp = new int[n][n];
        for (int i = 0; i < n; i++) dp[i][i] = 1;

        for (int len = 2; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                int best = dp[i + 1][j] + 1;
                if (arr[i] == arr[i + 1]) {
                    best = Math.min(best, (i + 2 <= j ? dp[i + 2][j] : 0) + 1);
                }
                for (int k = i + 2; k <= j; k++) {
                    if (arr[k] == arr[i]) {
                        int inner = (i + 1 <= k - 1) ? dp[i + 1][k - 1] : 0;
                        int rest = (k + 1 <= j) ? dp[k + 1][j] : 0;
                        best = Math.min(best, inner + rest);
                    }
                }
                dp[i][j] = best;
            }
        }
        return dp[0][n - 1];
    }
}
```

## Key Takeaways
- The crucial insight is that matching endpoints don't need to be adjacent to be removed together — clearing the strictly-inner gap first makes them adjacent "for free."
- This "clear the middle, then merge the matching ends" transition is the same idea used in Strange Printer and Remove Boxes.
- Bottom-up by increasing length is the standard safe iteration order for any interval DP whose recurrence only references shorter sub-intervals.
