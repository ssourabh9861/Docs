# Number of Submatrices That Sum to Target

**Difficulty:** Hard · **Pattern:** 2D prefix sum collapsed to 1D + hashmap of prefix sums · [LeetCode #1074](https://leetcode.com/problems/number-of-submatrices-that-sum-to-target/)

## Problem

Given a 2D integer matrix and a `target`, return the number of non-empty submatrices
(axis-aligned rectangles) whose sum of elements equals `target`.

## Examples

**Example 1**
```
Input:  matrix = [[0,1,0],[1,1,1],[0,1,0]], target = 0
Output: 4
Explanation: Four 1x1 submatrices containing only a 0.
```

**Example 2**
```
Input:  matrix = [[1,-1],[-1,1]], target = 0
Output: 5
```

## Constraints
- `1 <= rows, cols <= 100`
- `-1000 <= matrix[i][j] <= 1000`
- `-10^8 <= target <= 10^8`

## Approach 1 — Brute force with full 2D prefix sums

**Idea.** Build a 2D prefix-sum table so any rectangle sum is `O(1)`, then try every
`(r1, c1, r2, c2)` rectangle.

**Complexity.** Time `O(rows² · cols²)`, Space `O(rows · cols)`.

```java
public int numSubmatrixSumTarget(int[][] matrix, int target) {
    int rows = matrix.length, cols = matrix[0].length;
    int[][] ps = new int[rows + 1][cols + 1];
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            ps[r + 1][c + 1] = matrix[r][c] + ps[r][c + 1] + ps[r + 1][c] - ps[r][c];
        }
    }

    int count = 0;
    for (int r1 = 0; r1 < rows; r1++) {
        for (int r2 = r1; r2 < rows; r2++) {
            for (int c1 = 0; c1 < cols; c1++) {
                for (int c2 = c1; c2 < cols; c2++) {
                    int sum = ps[r2 + 1][c2 + 1] - ps[r1][c2 + 1] - ps[r2 + 1][c1] + ps[r1][c1];
                    if (sum == target) count++;
                }
            }
        }
    }
    return count;
}
```

## Approach 2 — Fix row pair, collapse to 1D, hashmap (optimal)

**Idea.** Fix a top row `r1` and bottom row `r2`, and maintain `colSum[c]` = sum of
column `c` between those rows (built incrementally as `r2` grows, avoiding
recomputation). The problem now reduces exactly to **Subarray Sum Equals K** on
`colSum`: count subarrays of `colSum` summing to `target` using running prefix sum +
hashmap in `O(cols)`. Summing over all `O(rows²)` row pairs gives the total.

**Complexity.** Time `O(rows² · cols)`, Space `O(cols)`.

```java
import java.util.HashMap;
import java.util.Map;

public int numSubmatrixSumTarget(int[][] matrix, int target) {
    int rows = matrix.length, cols = matrix[0].length;
    int count = 0;
    for (int r1 = 0; r1 < rows; r1++) {
        int[] colSum = new int[cols];
        for (int r2 = r1; r2 < rows; r2++) {
            for (int c = 0; c < cols; c++) {
                colSum[c] += matrix[r2][c];
            }
            count += subarraysWithSum(colSum, target);
        }
    }
    return count;
}

private int subarraysWithSum(int[] arr, int target) {
    Map<Integer, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0, 1);
    int sum = 0, count = 0;
    for (int x : arr) {
        sum += x;
        count += prefixCount.getOrDefault(sum - target, 0);
        prefixCount.merge(sum, 1, Integer::sum);
    }
    return count;
}
```

## Key Takeaways
- The single most important 2D-to-1D reduction: fix a pair of rows, collapse the
  columns between them into a 1D array, then reuse a 1D prefix-sum technique.
- Building `colSum` incrementally as the bottom row extends keeps the row-pair loop at
  `O(rows²)` total work instead of `O(rows³)`.
- This exact "fix rows, collapse columns" skeleton reappears in *Max Sum of Rectangle No
  Larger Than K* (same reduction, inequality query instead of equality).
