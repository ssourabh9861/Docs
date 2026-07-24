# Max Sum of Rectangle No Larger Than K

**Difficulty:** Hard · **Pattern:** 2D prefix sum collapsed to 1D + TreeSet ceiling search · [LeetCode #363](https://leetcode.com/problems/max-sum-of-rectangle-no-larger-than-k/)

## Problem

Given a 2D matrix and an integer `k`, find the maximum sum of a rectangular submatrix
whose sum is **no larger than** `k`. It is guaranteed at least one such rectangle exists.

## Examples

**Example 1**
```
Input:  matrix = [[1,0,1],[0,-2,3]], k = 2
Output: 2
Explanation: The rectangle [[0,1],[-2,3]] has sum 2, the largest sum <= 2.
```

**Example 2**
```
Input:  matrix = [[2,2,-1]], k = 0
Output: -1
```

## Constraints
- `1 <= rows, cols <= 100`
- `-100 <= matrix[i][j] <= 100`
- `-10^5 <= k <= 10^5`
- Follow-up: if `rows` is much larger than `cols` (or vice versa), transpose so the
  quadratic row-pair loop runs over the **smaller** dimension.

## Approach 1 — Brute force with full 2D prefix sums

**Idea.** Build a 2D prefix-sum table, try every rectangle, keep the max sum that
doesn't exceed `k`.

**Complexity.** Time `O(rows² · cols²)`, Space `O(rows · cols)`.

```java
public int maxSumSubmatrix(int[][] matrix, int k) {
    int rows = matrix.length, cols = matrix[0].length;
    int[][] ps = new int[rows + 1][cols + 1];
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            ps[r + 1][c + 1] = matrix[r][c] + ps[r][c + 1] + ps[r + 1][c] - ps[r][c];
        }
    }

    int best = Integer.MIN_VALUE;
    for (int r1 = 0; r1 < rows; r1++) {
        for (int r2 = r1; r2 < rows; r2++) {
            for (int c1 = 0; c1 < cols; c1++) {
                for (int c2 = c1; c2 < cols; c2++) {
                    int sum = ps[r2 + 1][c2 + 1] - ps[r1][c2 + 1] - ps[r2 + 1][c1] + ps[r1][c1];
                    if (sum <= k) best = Math.max(best, sum);
                }
            }
        }
    }
    return best;
}
```

## Approach 2 — Fix row pair, collapse to 1D, TreeSet of prefix sums (optimal)

**Idea.** As in *Number of Submatrices That Sum to Target*, fix a top/bottom row pair
and collapse to a 1D array `colSum`. Now the subproblem is: find the max subarray sum of
`colSum` that is `<= k`. Sweep prefix sums of `colSum` left to right while keeping a
`TreeSet` of prefixes seen so far. For the current prefix `P`, we want the smallest
earlier prefix `Q` with `Q >= P - k` (so that `P - Q <= k`); among all such `Q`,
the smallest one maximizes `P - Q`. `TreeSet.ceiling(P - k)` finds exactly that in
`O(log cols)`.

**Complexity.** Time `O(rows² · cols · log cols)`, Space `O(cols)`.

```java
import java.util.TreeSet;

public int maxSumSubmatrix(int[][] matrix, int k) {
    int rows = matrix.length, cols = matrix[0].length;
    int best = Integer.MIN_VALUE;

    for (int r1 = 0; r1 < rows; r1++) {
        int[] colSum = new int[cols];
        for (int r2 = r1; r2 < rows; r2++) {
            for (int c = 0; c < cols; c++) colSum[c] += matrix[r2][c];

            TreeSet<Integer> prefixSet = new TreeSet<>();
            prefixSet.add(0);
            int prefix = 0;
            for (int sum : colSum) {
                prefix += sum;
                Integer ceil = prefixSet.ceiling(prefix - k);
                if (ceil != null) {
                    best = Math.max(best, prefix - ceil);
                }
                prefixSet.add(prefix);
            }
        }
    }
    return best;
}
```

## Key Takeaways
- Same "fix rows, collapse to 1D" reduction as *Number of Submatrices That Sum to
  Target*, but here the query is an **inequality** (`sum <= k`), so an ordered structure
  (`TreeSet`) replaces the hashmap — hashmaps answer "does this exact value exist?",
  ordered sets answer "what's the closest value to a bound?".
- `prefixSet.ceiling(prefix - k)` is the crux: it finds the smallest earlier prefix that
  keeps the window sum within budget, which maximizes the resulting sum.
- For skewed matrices, transpose so the `O(dim²)` row-pair loop iterates the smaller
  dimension — keeps runtime closer to `O(min(rows,cols)² · max(rows,cols) · log(...))`.
