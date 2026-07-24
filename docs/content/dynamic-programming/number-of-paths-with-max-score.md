# Number of Paths with Max Score

**Difficulty:** Hard · **Pattern:** Grid DP tracking a (max-sum, count) pair simultaneously · [LeetCode](https://leetcode.com/problems/number-of-paths-with-max-score/)

## Problem
Given a square board of digits `'0'`-`'9'`, with `'S'` at the bottom-right (start) and `'E'` at the top-left (end), and `'X'` marking obstacles, find the maximum sum obtainable moving up, left, or up-left from `S` to `E`, and count how many distinct paths achieve that maximum. Return `[maxSum, count mod 1e9+7]`, or `[0, 0]` if `E` is unreachable.

## Examples
**Example 1**
```
Input:  board = ["E23","2X2","12S"]
Output: [7,1]
Explanation: The only max-sum path is S -> 2 -> 2 -> 3 -> ... summing to 7,
achieved by exactly 1 path.
```

## Constraints
- `2 <= board.length == board[i].length <= 100`
- Board contains digits `'0'-'9'`, exactly one `'S'`, one `'E'`, and possibly `'X'` cells.

## Approach 1 — 2D DP with paired (maxSum, count) arrays
**Idea.** Treat `S` (bottom-right) as the DP source and process cells in order of decreasing row and column, since moves only go up/left/up-left — equivalently, build `dp` starting at `S` and filling toward `E`. Define `sum[i][j]` = best sum from `(i,j)` to `S`, `cnt[i][j]` = number of ways achieving it. `sum[i][j] = value(i,j) + max(sum[i+1][j], sum[i][j+1], sum[i+1][j+1])`, and `cnt[i][j]` sums the counts of whichever neighbor(s) tie for that max. An `'X'` cell is simply unreachable (`sum = -1`, `cnt = 0`). `'S'` and `'E'` contribute value `0`.
**Complexity.** Time O(n²), Space O(n²).
```java
class Solution {
    public int[] pathsWithMaxScore(List<String> board) {
        int n = board.size();
        long[][] sum = new long[n][n];
        long[][] cnt = new long[n][n];
        final long MOD = 1_000_000_007L;
        for (long[] row : sum) Arrays.fill(row, -1L);

        sum[n - 1][n - 1] = 0;
        cnt[n - 1][n - 1] = 1;

        for (int i = n - 1; i >= 0; i--) {
            for (int j = n - 1; j >= 0; j--) {
                if (i == n - 1 && j == n - 1) continue;
                char c = board.get(i).charAt(j);
                if (c == 'X') continue;

                long best = -1;
                long ways = 0;
                int[][] dirs = {{1, 0}, {0, 1}, {1, 1}};
                for (int[] d : dirs) {
                    int ni = i + d[0], nj = j + d[1];
                    if (ni >= n || nj >= n || sum[ni][nj] == -1) continue;
                    if (sum[ni][nj] > best) {
                        best = sum[ni][nj];
                        ways = cnt[ni][nj];
                    } else if (sum[ni][nj] == best) {
                        ways = (ways + cnt[ni][nj]) % MOD;
                    }
                }
                if (best == -1) continue;
                int digit = (c == 'E' || c == 'S') ? 0 : (c - '0');
                sum[i][j] = best + digit;
                cnt[i][j] = ways;
            }
        }

        if (sum[0][0] == -1) return new int[]{0, 0};
        return new int[]{(int) sum[0][0], (int) cnt[0][0]};
    }
}
```

## Approach 2 — Space-optimized rolling rows
**Idea.** Since `dp[i][j]` only depends on row `i+1` and column `j+1` of the same row, keep just two rows (current and next) instead of the full `n x n` tables.
**Complexity.** Time O(n²), Space O(n).
```java
class Solution {
    public int[] pathsWithMaxScore(List<String> board) {
        int n = board.size();
        final long MOD = 1_000_000_007L;
        long[] nextSum = new long[n + 1];
        long[] nextCnt = new long[n + 1];
        long[] curSum = new long[n + 1];
        long[] curCnt = new long[n + 1];
        Arrays.fill(nextSum, -1);
        Arrays.fill(curSum, -1);
        nextSum[n - 1] = 0;
        nextCnt[n - 1] = 1;

        for (int i = n - 1; i >= 0; i--) {
            Arrays.fill(curSum, -1);
            Arrays.fill(curCnt, 0);
            for (int j = n - 1; j >= 0; j--) {
                if (i == n - 1 && j == n - 1) {
                    curSum[j] = 0;
                    curCnt[j] = 1;
                    continue;
                }
                char c = board.get(i).charAt(j);
                if (c == 'X') continue;

                long best = -1, ways = 0;
                // down (i+1,j) -> nextSum[j]; right (i,j+1) -> curSum[j+1]; diag (i+1,j+1) -> nextSum[j+1]
                long[] cands = {nextSum[j], curSum[j + 1], nextSum[j + 1]};
                long[] candCnt = {nextCnt[j], curCnt[j + 1], nextCnt[j + 1]};
                for (int k = 0; k < 3; k++) {
                    if (cands[k] == -1) continue;
                    if (cands[k] > best) { best = cands[k]; ways = candCnt[k]; }
                    else if (cands[k] == best) { ways = (ways + candCnt[k]) % MOD; }
                }
                if (best == -1) continue;
                int digit = (c == 'E' || c == 'S') ? 0 : (c - '0');
                curSum[j] = best + digit;
                curCnt[j] = ways;
            }
            long[] tmpS = nextSum; nextSum = curSum; curSum = tmpS;
            long[] tmpC = nextCnt; nextCnt = curCnt; curCnt = tmpC;
        }

        if (nextSum[0] == -1) return new int[]{0, 0};
        return new int[]{(int) nextSum[0], (int) nextCnt[0]};
    }
}
```

## Key Takeaways
- Carry two parallel DP tables — one for the optimal value, one for the count of ways to reach it — whenever a problem asks "max/min value AND how many ways."
- Ties in the max/min contribute additively to the count; a strictly better candidate resets the count.
- `'X'` obstacles and unreachable cells must propagate as "unreachable" (not just 0), or spurious zero-sum paths get counted.
