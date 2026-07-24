# Maximum Students Taking Exam

**Difficulty:** Hard · **Pattern:** row-by-row bitmask DP over valid non-adjacent seat masks, cross-checked against the previous row's mask · [LeetCode](https://leetcode.com/problems/maximum-students-taking-exam/)

## Problem
Given an `m x n` seat matrix where `'.'` is a usable seat and `'#'` is broken, seat the maximum number of students such that no student can see another's answers: no two seated students may be in horizontally-adjacent seats, nor diagonally-adjacent seats in the immediately preceding or following row (directly-above/below in the same column is fine).

## Examples
**Example 1**
```
Input:  seats =
[["#",".","#","#",".","#"],
 [".","#","#","#","#","."],
 ["#",".","#","#",".","#"]]
Output: 4
Explanation: Example valid seating: row0 seats col1 and col4; row1 seats col0 and col5;
             row2 seats col1 and col4 — all pairwise constraints satisfied, total 4.
```
**Example 2**
```
Input:  seats = [[".",".",".",".","."]]
Output: 3
Explanation: Best non-adjacent seating in a single row of 5 all-good seats seats
             columns 0, 2, 4 (or 1,3 + one more), giving 3 students.
```

## Constraints
- `m == seats.length`
- `n == seats[i].length`
- `1 <= m, n <= 8`
- `seats[i][j]` is `'.'` or `'#'`.

## Approach 1 — Row masks + brute validity check against previous row (bitmask DP)
**Idea.** For each row, enumerate all bitmasks `mask` over its `n` seats that are (a) subsets of the row's broken-seat-free positions, and (b) have no two horizontally adjacent set bits (`mask & (mask << 1) == 0`). Define `dp[i][mask]` = maximum students seated using rows `0..i`, with row `i`'s seating exactly `mask`. Transition from row `i-1`'s mask `prev` to row `i`'s mask `cur` is legal only if there's no diagonal conflict: `(cur & (prev << 1)) == 0` and `(cur & (prev >> 1)) == 0` (no set bit in `cur` diagonally adjacent to a set bit in `prev`). Then `dp[i][cur] = max over valid prev of dp[i-1][prev] + popcount(cur)`.

**Complexity.** Time O(m · 3^n) roughly (enumerating valid masks per row and pairing with previous row masks, both bounded by `2^n`, giving O(m · 4^n) worst case, in practice much less after validity filtering), Space O(2^n).
```java
class Solution {
    public int maxStudents(char[][] seats) {
        int m = seats.length;
        int n = seats[0].length;

        int[] rowMask = new int[m];
        for (int i = 0; i < m; i++) {
            int mask = 0;
            for (int j = 0; j < n; j++) {
                if (seats[i][j] == '.') mask |= (1 << j);
            }
            rowMask[i] = mask;
        }

        int full = 1 << n;
        int[][] dp = new int[m][full];
        for (int[] row : dp) java.util.Arrays.fill(row, -1);

        // Row 0: try every valid, seat-available, non-horizontally-adjacent mask.
        for (int cur = 0; cur < full; cur++) {
            if (!isValidPlacement(cur, rowMask[0])) continue;
            dp[0][cur] = Integer.bitCount(cur);
        }

        for (int i = 1; i < m; i++) {
            for (int cur = 0; cur < full; cur++) {
                if (!isValidPlacement(cur, rowMask[i])) continue;
                int curCount = Integer.bitCount(cur);
                for (int prev = 0; prev < full; prev++) {
                    if (dp[i - 1][prev] < 0) continue;
                    if (!noDiagonalConflict(cur, prev)) continue;
                    int candidate = dp[i - 1][prev] + curCount;
                    if (candidate > dp[i][cur]) {
                        dp[i][cur] = candidate;
                    }
                }
            }
        }

        int best = 0;
        for (int mask = 0; mask < full; mask++) {
            best = Math.max(best, dp[m - 1][mask]);
        }
        return best;
    }

    // cur must only use available seats and have no two horizontally adjacent bits.
    private boolean isValidPlacement(int cur, int available) {
        if ((cur & available) != cur) return false;   // uses a broken seat
        if ((cur & (cur << 1)) != 0) return false;      // horizontally adjacent
        return true;
    }

    // No seat in cur is diagonally adjacent (col-1 or col+1 in the other row) to a seat in prev.
    private boolean noDiagonalConflict(int cur, int prev) {
        if ((cur & (prev << 1)) != 0) return false;
        if ((cur & (prev >> 1)) != 0) return false;
        return true;
    }
}
```

## Approach 2 — Precompute valid row masks once, prune the prev-loop early (optimal in practice)
**Idea.** Same DP structure, but precompute the list of valid masks *per row* once (rather than re-checking all `2^n` masks against `rowMask[i]` inside nested loops) and only iterate over previously-valid masks. This cuts the constant factor substantially since the number of valid non-adjacent masks for `n <= 8` is small (Fibonacci-like, at most ~55 for n=8) compared to `2^8 = 256`.

**Complexity.** Time O(m · V^2) where `V` = number of valid masks per row (V ≤ Fibonacci(n+2), tiny for n ≤ 8), Space O(m · V).
```java
import java.util.*;

class Solution {
    public int maxStudents(char[][] seats) {
        int m = seats.length;
        int n = seats[0].length;

        int[] available = new int[m];
        for (int i = 0; i < m; i++) {
            int mask = 0;
            for (int j = 0; j < n; j++) {
                if (seats[i][j] == '.') mask |= (1 << j);
            }
            available[i] = mask;
        }

        int full = 1 << n;
        // All masks with no two horizontally adjacent bits (independent of availability).
        List<Integer> noAdjacent = new ArrayList<>();
        for (int mask = 0; mask < full; mask++) {
            if ((mask & (mask << 1)) == 0) noAdjacent.add(mask);
        }

        // Per row, the subset of noAdjacent masks that also respect broken seats.
        List<List<Integer>> validPerRow = new ArrayList<>();
        for (int i = 0; i < m; i++) {
            List<Integer> valid = new ArrayList<>();
            for (int mask : noAdjacent) {
                if ((mask & available[i]) == mask) valid.add(mask);
            }
            validPerRow.add(valid);
        }

        Map<Integer, Integer> prevDp = new HashMap<>();
        prevDp.put(0, 0); // sentinel "no previous row" state
        // Seed with an artificial previous row of mask 0 for row 0's processing,
        // but treat row 0 specially since there is no diagonal constraint above it.
        Map<Integer, Integer> rowDp = new HashMap<>();
        for (int cur : validPerRow.get(0)) {
            rowDp.put(cur, Integer.bitCount(cur));
        }
        prevDp = rowDp;

        for (int i = 1; i < m; i++) {
            Map<Integer, Integer> curDp = new HashMap<>();
            for (int cur : validPerRow.get(i)) {
                int curCount = Integer.bitCount(cur);
                int best = -1;
                for (Map.Entry<Integer, Integer> e : prevDp.entrySet()) {
                    int prev = e.getKey();
                    if ((cur & (prev << 1)) != 0) continue;
                    if ((cur & (prev >> 1)) != 0) continue;
                    best = Math.max(best, e.getValue());
                }
                if (best >= 0) {
                    curDp.put(cur, best + curCount);
                }
            }
            prevDp = curDp;
        }

        int ans = 0;
        for (int v : prevDp.values()) ans = Math.max(ans, v);
        return ans;
    }
}
```

## Key Takeaways
- Three constraints stack per row transition: seat availability (`cur & available == cur`), horizontal non-adjacency within a row (`cur & (cur<<1) == 0`), and diagonal non-adjacency across consecutive rows (`cur & (prev<<1) == 0` and `cur & (prev>>1) == 0`) — same-column vertical adjacency is explicitly allowed and needs no check.
- Precomputing the (small) set of horizontally-valid masks once, independent of any row's broken seats, and then filtering per row, avoids re-deriving adjacency validity `m` times.
- With `n <= 8`, `2^n = 256` is small enough that even the unpruned `O(m · 4^n)` version runs instantly — the optimization in Approach 2 mainly matters for larger `n` or tighter constraints.
