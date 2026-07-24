# N-Queens / N-Queens II

**Difficulty:** Hard · **Pattern:** row-by-row backtracking with column/diagonal bitmask pruning · [LeetCode](https://leetcode.com/problems/n-queens/)

## Problem
Place `n` queens on an `n x n` chessboard so that no two queens attack each other. N-Queens asks for all distinct board configurations (as strings); N-Queens II asks only for the **count** of distinct solutions.

## Examples
**Example 1**
```
Input:  n = 4
Output: [[".Q..","...Q","Q...","..Q."],["..Q.","Q...","...Q",".Q.."]]
Explanation: 2 distinct arrangements exist for a 4x4 board.
```
**Example 2**
```
Input:  n = 1
Output: 1   (N-Queens II)
Explanation: Trivially place the single queen anywhere on the 1x1 board.
```

## Constraints
- `1 <= n <= 9`

## Approach 1 — Backtracking with boolean occupancy sets
**Idea.** Place one queen per row. Track occupied columns, and the two diagonal families (`row - col` and `row + col` are each constant along a diagonal) with boolean sets. At row `r`, try every column `c`; if none of the three sets mark it attacked, place the queen, recurse to row `r+1`, then undo (un-choose) before trying the next column. When `r == n`, record the board.
**Complexity.** Time O(n!) worst case (heavily pruned in practice), Space O(n) for the recursion/occupancy sets.
```java
import java.util.*;

class Solution {
    private List<List<String>> results = new ArrayList<>();
    private int n;
    private boolean[] cols, diag1, diag2; // diag1: r-c+n-1, diag2: r+c
    private int[] queenCol; // queenCol[row] = chosen column

    public List<List<String>> solveNQueens(int n) {
        this.n = n;
        cols = new boolean[n];
        diag1 = new boolean[2 * n];
        diag2 = new boolean[2 * n];
        queenCol = new int[n];
        backtrack(0);
        return results;
    }

    private void backtrack(int row) {
        if (row == n) {
            results.add(buildBoard());
            return;
        }
        for (int c = 0; c < n; c++) {
            int d1 = row - c + n - 1, d2 = row + c;
            if (cols[c] || diag1[d1] || diag2[d2]) continue;
            // choose
            cols[c] = diag1[d1] = diag2[d2] = true;
            queenCol[row] = c;
            backtrack(row + 1);
            // un-choose
            cols[c] = diag1[d1] = diag2[d2] = false;
        }
    }

    private List<String> buildBoard() {
        List<String> board = new ArrayList<>();
        for (int r = 0; r < n; r++) {
            char[] rowArr = new char[n];
            Arrays.fill(rowArr, '.');
            rowArr[queenCol[r]] = 'Q';
            board.add(new String(rowArr));
        }
        return board;
    }
}
```

## Approach 2 — Bitmask columns/diagonals (optimal / pruned)
**Idea.** Replace the three boolean arrays with three integer bitmasks (`cols`, `diag1`, `diag2`) representing all attacked positions in the current row. The set of legal columns for this row is `available = ((1<<n)-1) & ~(cols | diag1 | diag2)`. Peel off the lowest set bit each iteration with `bit = available & -available`, place, recurse with the masks shifted (`diag1` shifts left, `diag2` shifts right to keep diagonals aligned across rows), then remove the bit. This avoids per-column boolean lookups and is the standard optimal solution for N-Queens II.
**Complexity.** Time O(n!) worst case but with a much smaller constant factor (word-level operations), Space O(n) recursion depth.
```java
class Solution {
    private int n;
    private int count = 0;
    private int full;

    public int totalNQueens(int n) {
        this.n = n;
        this.full = (1 << n) - 1;
        backtrack(0, 0, 0);
        return count;
    }

    // cols, diag1, diag2 are bitmasks of attacked columns for the current row
    private void backtrack(int cols, int diag1, int diag2) {
        if (cols == full) {
            count++;
            return;
        }
        int available = full & ~(cols | diag1 | diag2);
        while (available != 0) {
            int bit = available & (-available); // lowest set bit = choose this column
            available -= bit;                     // remove it from remaining choices
            backtrack(cols | bit,
                      (diag1 | bit) << 1,
                      (diag2 | bit) >> 1);
            // no explicit "un-choose" needed: cols/diag1/diag2 are passed by value
        }
    }
}
```

## Key Takeaways
- Placing one queen per row automatically avoids row conflicts, cutting the search space from `n^2` cells to `n` rows.
- Diagonals are identified by the invariants `row - col` (constant on a "/"-normalized index) and `row + col` (constant on the anti-diagonal) — this is the key insight for O(1) attack checks.
- The bitmask version is the standard optimal trick: shifting `diag1`/`diag2` by one bit per row naturally re-aligns diagonal attacks without recomputation, and peeling the lowest set bit (`x & -x`) enumerates candidate columns without a loop over all n bits.
- N-Queens II is exactly N-Queens with board construction removed — count instead of collect.
