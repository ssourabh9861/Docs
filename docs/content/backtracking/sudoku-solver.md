# Sudoku Solver

**Difficulty:** Hard · **Pattern:** constraint-propagation backtracking (row/col/box bitmasks) · [LeetCode](https://leetcode.com/problems/sudoku-solver/)

## Problem
Fill a partially filled 9x9 Sudoku board so every row, column, and 3x3 sub-box contains the digits 1-9 exactly once. Modify the board in place; a unique solution is guaranteed.

## Examples
**Example 1**
```
Input:  board = [["5","3",".",".","7",".",".",".","."],
                  ["6",".",".","1","9","5",".",".","."],
                  [".","9","8",".",".",".",".","6","."],
                  ["8",".",".",".","6",".",".",".","3"],
                  ["4",".",".","8",".","3",".",".","1"],
                  ["7",".",".",".","2",".",".",".","6"],
                  [".","6",".",".",".",".","2","8","."],
                  [".",".",".","4","1","9",".",".","5"],
                  [".",".",".",".","8",".",".","7","9"]]
Output: the fully solved board (board is mutated in place)
Explanation: Each empty cell is filled so all rows/cols/boxes contain 1-9 once.
```

## Constraints
- `board.length == 9`, `board[i].length == 9`
- `board[i][j]` is a digit `1-9` or `'.'`
- It is guaranteed that the input board has only one solution

## Approach 1 — Plain backtracking with a `isValid` scan
**Idea.** Scan for the first empty cell, try digits `1..9`, and for each candidate re-scan its row, column, and 3x3 box to check validity. If valid, place it and recurse to the next empty cell; if the recursion fails, un-choose (reset to `'.'`) and try the next digit. Return `true` up the stack as soon as a full solution is found so we stop immediately instead of exploring more (since the puzzle has one solution, but the framework should stop on first success).
**Complexity.** Time O(9^m) in the worst case (m empty cells) with each validity check costing O(1) amortized (9+9+9 cells), Space O(1) extra (board itself) plus O(m) recursion depth.
```java
class Solution {
    public void solveSudoku(char[][] board) {
        solve(board);
    }

    private boolean solve(char[][] board) {
        for (int r = 0; r < 9; r++) {
            for (int c = 0; c < 9; c++) {
                if (board[r][c] != '.') continue;
                for (char d = '1'; d <= '9'; d++) {
                    if (!isValid(board, r, c, d)) continue;
                    board[r][c] = d;              // choose
                    if (solve(board)) return true; // explore
                    board[r][c] = '.';             // un-choose
                }
                return false; // no digit works here -> backtrack
            }
        }
        return true; // no empty cell left: solved
    }

    private boolean isValid(char[][] board, int row, int col, char d) {
        int boxRow = (row / 3) * 3, boxCol = (col / 3) * 3;
        for (int i = 0; i < 9; i++) {
            if (board[row][i] == d) return false;
            if (board[i][col] == d) return false;
            if (board[boxRow + i / 3][boxCol + i % 3] == d) return false;
        }
        return true;
    }
}
```

## Approach 2 — Bitmask constraint tracking (optimal / pruned)
**Idea.** Precompute three arrays of bitmasks — `rowMask[9]`, `colMask[9]`, `boxMask[9]` — where bit `d` (1-9) tells whether digit `d` is already used in that row/column/box. Placing or removing a digit is an O(1) XOR toggle instead of an O(9) rescan. For each empty cell, the set of legal digits is `~(rowMask[r] | colMask[c] | boxMask[b]) & 0x3FE` (bits 1-9); iterate only over that reduced candidate set with bit tricks. This removes redundant row/col/box scans entirely, giving a much faster constant factor than Approach 1, which matters heavily on near-empty boards.
**Complexity.** Time O(9^m) worst case but with O(1) validity checks (vs O(27) scans), Space O(1) extra for the masks plus O(m) recursion depth.
```java
class Solution {
    private int[] rowMask = new int[9];
    private int[] colMask = new int[9];
    private int[] boxMask = new int[9];
    private char[][] board;

    public void solveSudoku(char[][] board) {
        this.board = board;
        for (int r = 0; r < 9; r++) {
            for (int c = 0; c < 9; c++) {
                if (board[r][c] != '.') {
                    int d = board[r][c] - '0';
                    int bit = 1 << d;
                    rowMask[r] |= bit;
                    colMask[c] |= bit;
                    boxMask[boxIndex(r, c)] |= bit;
                }
            }
        }
        solve(0, 0);
    }

    private int boxIndex(int r, int c) {
        return (r / 3) * 3 + (c / 3);
    }

    private boolean solve(int r, int c) {
        if (r == 9) return true;
        int nr = (c == 8) ? r + 1 : r;
        int nc = (c == 8) ? 0 : c + 1;

        if (board[r][c] != '.') return solve(nr, nc);

        int b = boxIndex(r, c);
        int used = rowMask[r] | colMask[c] | boxMask[b];
        for (int d = 1; d <= 9; d++) {
            int bit = 1 << d;
            if ((used & bit) != 0) continue;

            // choose
            board[r][c] = (char) ('0' + d);
            rowMask[r] |= bit; colMask[c] |= bit; boxMask[b] |= bit;

            if (solve(nr, nc)) return true;

            // un-choose
            board[r][c] = '.';
            rowMask[r] &= ~bit; colMask[c] &= ~bit; boxMask[b] &= ~bit;
        }
        return false;
    }
}
```

## Key Takeaways
- Sudoku is backtracking with three simultaneous constraints (row, column, box) — the box index formula `(r/3)*3 + c/3` is the piece most people fumble.
- Returning a `boolean` "found a solution" from the recursion lets you short-circuit the entire search the instant a valid board is completed, which is essential since re-exploring after finding the unique solution wastes time.
- Bitmasking constraints turns each validity check from O(27) into O(1), and is the natural next step once the naive version is understood — the same idea used in N-Queens.
- Always place then un-place (`board[r][c] = d` ... `board[r][c] = '.'`) symmetrically around the recursive call; forgetting the un-choose step corrupts sibling branches.
