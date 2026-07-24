# Median of a Row-Wise Sorted Matrix

**Difficulty:** Hard · **Pattern:** Binary search on the answer (count-based predicate using per-row binary search) · [LeetCode](https://leetcode.com/problems/median-in-a-row-wise-sorted-matrix/)

## Problem
Given an `r x c` matrix where each row is individually sorted in ascending order (columns are not necessarily sorted) and `r * c` is odd, find the median of all the elements in the matrix.

## Examples
**Example 1**
```
Input:  matrix = [[1,3,5],[2,6,9],[3,6,9]]
Output: 5
Explanation: All elements sorted: 1,2,3,3,5,6,6,9,9 (9 elements) -> median is the 5th = 5.
```
**Example 2**
```
Input:  matrix = [[1,1,2],[2,3,3],[1,3,4]]
Output: 2
Explanation: Sorted: 1,1,1,2,2,3,3,3,4 -> 5th element = 2.
```

## Constraints
- `r == matrix.length`, `c == matrix[i].length`
- `1 <= r, c <= 400`
- `1 <= matrix[i][j] <= 2 * 10^9`
- `r * c` is odd.
- Each row is sorted in non-decreasing order.

## Approach 1 — Flatten, sort, and pick the middle
**Idea.** Copy every element into one array, sort it, and index the middle element.
**Complexity.** Time O(r*c log(r*c)), Space O(r*c).
```java
class Solution {
    public int findMedian(int[][] matrix) {
        int r = matrix.length, c = matrix[0].length;
        int[] all = new int[r * c];
        int idx = 0;
        for (int[] row : matrix) for (int val : row) all[idx++] = val;
        Arrays.sort(all);
        return all[(r * c) / 2];
    }
}
```

## Approach 2 — Binary search on the answer with per-row binary search (optimal)
**Idea.** The median is the value `x` such that the count of elements `<= x` across the whole matrix is exactly `(r*c)/2 + 1` at its first occurrence (i.e., the smallest `x` for which `countLessOrEqual(x) > r*c/2`). Binary search `mid` over the value range `[minVal, maxVal]` (min/max of the first/last column, since rows are sorted, `matrix[i][0]` and `matrix[i][c-1]` bound row `i`). **Predicate/count function** `countLessOrEqual(mid)`: for each row, since it's individually sorted, use binary search (`upperBound`) to count elements `<= mid` in O(log c); sum across all `r` rows. The smallest `mid` with `countLessOrEqual(mid) > r*c/2` is the median (guaranteed to be an actual matrix value because the count only increases at real values present in the matrix).
**Complexity.** Time O(r log c * log(maxVal - minVal)), Space O(1) extra.
```java
class Solution {
    public int findMedian(int[][] matrix) {
        int r = matrix.length, c = matrix[0].length;
        int lo = Integer.MAX_VALUE, hi = Integer.MIN_VALUE;
        for (int[] row : matrix) {
            lo = Math.min(lo, row[0]);
            hi = Math.max(hi, row[c - 1]);
        }

        int target = (r * c) / 2 + 1; // rank of the median (1-indexed)
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (countLessOrEqual(matrix, mid) >= target) {
                hi = mid;       // enough elements <= mid, median is mid or smaller
            } else {
                lo = mid + 1;   // not enough, median is larger
            }
        }
        return lo;
    }

    private int countLessOrEqual(int[][] matrix, int target) {
        int count = 0;
        for (int[] row : matrix) {
            count += upperBound(row, target);
        }
        return count;
    }

    // number of elements in sorted row that are <= target
    private int upperBound(int[] row, int target) {
        int lo = 0, hi = row.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (row[mid] <= target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}
```

## Key Takeaways
- Nested binary search: binary search on the answer (matrix value), with each feasibility check itself doing a per-row binary search (`upperBound`) — a common "two-level" binary search shape.
- The count target for a median of `r*c` (odd) elements is `(r*c)/2 + 1` in 1-indexed rank terms; find the smallest value whose cumulative count reaches that rank.
- Search bounds use the first and last column (`row[0]`, `row[c-1]`) since rows are individually sorted — no need to know column order.
- Related: Kth Smallest Element in a Sorted Matrix (nearly identical, but there both rows and columns are sorted, enabling an O(n) staircase count instead of per-row binary search).
