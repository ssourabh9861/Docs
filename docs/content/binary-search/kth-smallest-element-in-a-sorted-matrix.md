# Kth Smallest Element in a Sorted Matrix

**Difficulty:** Hard (Medium on some platforms) · **Pattern:** Binary search on the answer (count-based predicate over matrix) · [LeetCode](https://leetcode.com/problems/kth-smallest-element-in-a-sorted-matrix/)

## Problem
Given an `n x n` matrix where each row and each column is sorted in ascending order, find the `k`-th smallest element in the matrix.

## Examples
**Example 1**
```
Input:  matrix = [[1,5,9],[10,11,13],[12,13,15]], k = 8
Output: 13
Explanation: Sorted order: 1,5,9,10,11,12,13,13,15 -> 8th is 13.
```
**Example 2**
```
Input:  matrix = [[-5]], k = 1
Output: -5
```

## Constraints
- `n == matrix.length == matrix[i].length`
- `1 <= n <= 300`
- `-10^9 <= matrix[i][j] <= 10^9`
- Rows and columns are sorted ascending.
- `1 <= k <= n^2`

## Approach 1 — Merge all rows with a min-heap
**Idea.** Push the first element of each row into a min-heap along with its (row, col); pop `k` times, each time pushing the popped cell's row-neighbor.
**Complexity.** Time O(k log n), Space O(n).
```java
class Solution {
    public int kthSmallest(int[][] matrix, int k) {
        int n = matrix.length;
        PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
        for (int r = 0; r < n; r++) heap.offer(new int[]{matrix[r][0], r, 0});

        int result = -1;
        for (int i = 0; i < k; i++) {
            int[] top = heap.poll();
            result = top[0];
            int r = top[1], c = top[2];
            if (c + 1 < n) heap.offer(new int[]{matrix[r][c + 1], r, c + 1});
        }
        return result;
    }
}
```

## Approach 2 — Binary search on the answer (optimal)
**Idea.** Binary search the candidate value `mid` over `[matrix[0][0], matrix[n-1][n-1]]`. **Predicate/count function** `countLessOrEqual(mid)`: starting from the bottom-left cell, walk a staircase pointer — if the current cell's value is `<= mid`, all cells above it in that column are also `<= mid`, so add `row+1` to the count and move right; otherwise move up. This gives the count of elements `<= mid` in O(n) per check. Binary search for the smallest `mid` with `countLessOrEqual(mid) >= k`; that `mid` is guaranteed to be an actual matrix value.
**Complexity.** Time O(n log(max - min)), Space O(1).
```java
class Solution {
    public int kthSmallest(int[][] matrix, int k) {
        int n = matrix.length;
        int lo = matrix[0][0], hi = matrix[n - 1][n - 1];

        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (countLessOrEqual(matrix, mid) >= k) {
                hi = mid;       // enough elements <= mid, try smaller
            } else {
                lo = mid + 1;   // not enough, need larger value
            }
        }
        return lo;
    }

    // count of matrix elements <= target, using staircase walk from bottom-left
    private int countLessOrEqual(int[][] matrix, int target) {
        int n = matrix.length;
        int row = n - 1, col = 0, count = 0;
        while (row >= 0 && col < n) {
            if (matrix[row][col] <= target) {
                count += row + 1; // whole column above (and including) this row qualifies
                col++;
            } else {
                row--;
            }
        }
        return count;
    }
}
```

## Key Takeaways
- The staircase (bottom-left to top-right) walk exploits both row- and column-sortedness to count `<= target` in O(n) — same idea used in "Search a 2D Matrix II".
- Binary search here is over matrix *values*, not indices; the predicate is a monotonic count, converging to the smallest value whose count meets `k`.
- Heap approach (Approach 1) is simpler to write but worse when `k` is close to `n^2`; binary search wins asymptotically since it never depends on `k` in its complexity.
- Related: Find K-th Smallest Pair Distance (same count-based binary search template, different count function).
