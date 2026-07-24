# Trapping Rain Water II

**Difficulty:** Hard · **Pattern:** Min-heap boundary BFS (2D generalization; not a pure two-pointer problem) · [LeetCode](https://leetcode.com/problems/trapping-rain-water-ii/)

## Problem
Given a 2D elevation map (matrix of non-negative heights), compute the total volume of water it can trap after raining, where water can flow off the outer edges of the grid.

## Examples
**Example 1**
```
Input:  heightMap = [[1,4,3,1,3,2],[3,2,1,3,2,4],[2,3,3,2,3,1]]
Output: 4
Explanation: Water gets trapped in the interior cells that are lower than their surrounding boundary.
```
**Example 2**
```
Input:  heightMap = [[3,3,3,3,3],[3,2,2,2,3],[3,2,1,2,3],[3,2,2,2,3],[3,3,3,3,3]]
Output: 10
```

## Constraints
- m == heightMap.length, n == heightMap[i].length
- 1 <= m, n <= 200
- 0 <= heightMap[i][j] <= 2 * 10^5

## Approach 1 — Water-level rising flood fill (brute force)
**Idea.** For each candidate water level from 1 up to the maximum height, flood-fill from the border through all cells with height less than that level (border-connected regions leak out and hold no water). Any cell strictly below the current level that is *not* reachable from the border is submerged by exactly one unit at this level. Repeating this level-by-level over all possible heights and summing submerged cells gives the total trapped volume, but it redoes connectivity work at every level.
**Complexity.** Time O(maxHeight * m * n) for repeated flood fills, Space O(m*n) for the visited grid per level.
```java
import java.util.*;

class Solution {
    public int trapRainWaterBruteForce(int[][] heightMap) {
        int m = heightMap.length, n = heightMap[0].length;
        int maxHeight = 0;
        for (int[] row : heightMap) for (int h : row) maxHeight = Math.max(maxHeight, h);

        int total = 0;
        for (int level = 1; level <= maxHeight; level++) {
            boolean[][] canLeak = new boolean[m][n];
            Deque<int[]> queue = new ArrayDeque<>();
            for (int i = 0; i < m; i++) {
                for (int j = 0; j < n; j++) {
                    boolean isBorder = i == 0 || i == m - 1 || j == 0 || j == n - 1;
                    if (isBorder && heightMap[i][j] < level && !canLeak[i][j]) {
                        canLeak[i][j] = true;
                        queue.offer(new int[]{i, j});
                    }
                }
            }
            int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
            while (!queue.isEmpty()) {
                int[] cell = queue.poll();
                for (int[] d : dirs) {
                    int nr = cell[0] + d[0], nc = cell[1] + d[1];
                    if (nr < 0 || nr >= m || nc < 0 || nc >= n || canLeak[nr][nc]) continue;
                    if (heightMap[nr][nc] < level) {
                        canLeak[nr][nc] = true;
                        queue.offer(new int[]{nr, nc});
                    }
                }
            }
            for (int i = 1; i < m - 1; i++) {
                for (int j = 1; j < n - 1; j++) {
                    if (heightMap[i][j] < level && !canLeak[i][j]) total++;
                }
            }
        }
        return total;
    }
}
```

## Approach 2 — Min-heap boundary BFS (optimal)
**Idea.** Water level at any cell is bounded by the lowest "wall" along the path to the grid border — this is the 2D analogue of the two-pointer trick, but two 1D pointers can't represent a 2D boundary, so we use a priority queue instead. Push all border cells into a min-heap (keyed by height) and mark them visited. Repeatedly pop the globally smallest boundary cell; for each unvisited neighbor, the trapped water there is `max(0, currentBoundaryHeight - neighborHeight)`, and the neighbor's own effective height for further propagation becomes `max(currentBoundaryHeight, neighborHeight)` — then push the neighbor into the heap as the new (possibly raised) boundary. This is essentially Dijkstra's algorithm where the "cost" to reach a cell is the minimum possible enclosing wall height along any path.
**Complexity.** Time O(m*n*log(m*n)) for the heap operations, Space O(m*n) for the visited grid and heap.
```java
import java.util.*;

class Solution {
    public int trapRainWater(int[][] heightMap) {
        int m = heightMap.length;
        if (m == 0) return 0;
        int n = heightMap[0].length;
        if (n == 0) return 0;

        boolean[][] visited = new boolean[m][n];
        // heap entries: {height, row, col}, ordered by height ascending
        PriorityQueue<int[]> minHeap = new PriorityQueue<>((a, b) -> a[0] - b[0]);

        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (i == 0 || i == m - 1 || j == 0 || j == n - 1) {
                    minHeap.offer(new int[]{heightMap[i][j], i, j});
                    visited[i][j] = true;
                }
            }
        }

        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        int water = 0;

        while (!minHeap.isEmpty()) {
            int[] cell = minHeap.poll();
            int boundaryHeight = cell[0], r = cell[1], c = cell[2];
            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr < 0 || nr >= m || nc < 0 || nc >= n || visited[nr][nc]) continue;
                visited[nr][nc] = true;
                int neighborHeight = heightMap[nr][nc];
                if (neighborHeight < boundaryHeight) {
                    water += boundaryHeight - neighborHeight;
                }
                minHeap.offer(new int[]{Math.max(boundaryHeight, neighborHeight), nr, nc});
            }
        }
        return water;
    }
}
```

## Key Takeaways
- The 1D two-pointer trick from Trapping Rain Water doesn't generalize to 2D because there's no single "shorter side" — the enclosing boundary is a whole frontier, which is why a min-heap (processing the globally lowest wall first) replaces the pointer pair.
- This is structurally Dijkstra's algorithm: the "distance" being minimized is the tallest-wall-along-the-path, and the heap ensures cells are finalized in increasing order of their true boundary height.
- Always start the heap with all border cells (water can escape off the edges, so borders can never trap water and always define the initial boundary).
- Related problems: Trapping Rain Water (1D, two pointers), Swim in Rising Water (same min-heap/Dijkstra-style frontier idea).
