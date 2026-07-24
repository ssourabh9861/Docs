# Making a Large Island

**Difficulty:** Hard · **Pattern:** DFS island-labeling + size memoization, then test each 0-cell by merging its distinct neighboring island labels (Union-Find variant works too) · [LeetCode](https://leetcode.com/problems/making-a-large-island/)

## Problem
Given an `n x n` binary grid, you may change **at most one** `0` to a `1`. Return the size of the largest possible island (4-directionally connected group of `1`s) after doing so (or the size of the largest existing island if the grid is all `1`s already, or `1` if flipping a single `0` cell in an all-zero grid).

## Examples
**Example 1**
```
Input:  grid = [[1,0],[0,1]]
Output: 3
Explanation: Flipping either 0 connects two islands of size 1 into a size-3 island (including the flipped cell).
```
**Example 2**
```
Input:  grid = [[1,1],[1,0]]
Output: 4
Explanation: Flipping the single 0 makes the entire grid one island of size 4.
```

## Constraints
- n == grid.length == grid[i].length
- 1 <= n <= 500
- grid[i][j] is 0 or 1

## Approach 1 — DFS-label each island with a unique id and cache its size (primary approach)
**Idea.** DFS/flood-fill every existing island, assign it a unique label (starting at 2, since 0/1 are grid values), and record `label -> size` in a map. Then, for every `0` cell, look at its up to 4 neighbors, collect the **distinct** labels among them, sum their sizes plus 1 (for the flipped cell itself), and track the maximum across all such candidate cells. If the grid has no `0` cells at all, the answer is `n*n`.
**Complexity.** Time O(n^2), Space O(n^2).
```java
class Solution {
    public int largestIsland(int[][] grid) {
        int n = grid.length;
        Map<Integer, Integer> labelSize = new HashMap<>();
        int label = 2;

        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 1) {
                    int size = dfsLabel(grid, i, j, label, n);
                    labelSize.put(label, size);
                    label++;
                }
            }
        }

        int best = labelSize.values().stream().max(Integer::compare).orElse(0);
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 0) {
                    Set<Integer> neighborLabels = new HashSet<>();
                    for (int[] d : dirs) {
                        int ni = i + d[0], nj = j + d[1];
                        if (ni >= 0 && ni < n && nj >= 0 && nj < n && grid[ni][nj] > 1) {
                            neighborLabels.add(grid[ni][nj]);
                        }
                    }
                    int total = 1;
                    for (int lab : neighborLabels) total += labelSize.get(lab);
                    best = Math.max(best, total);
                }
            }
        }
        return best;
    }

    private int dfsLabel(int[][] grid, int i, int j, int label, int n) {
        if (i < 0 || i >= n || j < 0 || j >= n || grid[i][j] != 1) return 0;
        grid[i][j] = label;
        int size = 1;
        size += dfsLabel(grid, i + 1, j, label, n);
        size += dfsLabel(grid, i - 1, j, label, n);
        size += dfsLabel(grid, i, j + 1, label, n);
        size += dfsLabel(grid, i, j - 1, label, n);
        return size;
    }
}
```

## Approach 2 — Union-Find merging islands via 0-cells (optimal alternative, avoids deep recursion)
**Idea.** Same overall idea but built with DSU instead of recursive flood-fill (useful for n up to 500 where deep recursion could risk stack depth on pathological grids). Union all adjacent `1`-cells first to get island components and sizes via DSU. Then, for every `0` cell, gather the distinct roots among its neighbors, sum their component sizes plus 1, and track the max. This avoids recursion entirely, replacing it with iterative union operations.
**Complexity.** Time O(n^2 · α(n^2)), Space O(n^2).
```java
class Solution {
    private int[] parent, size_;

    public int largestIsland(int[][] grid) {
        int n = grid.length;
        parent = new int[n * n];
        size_ = new int[n * n];
        for (int i = 0; i < n * n; i++) { parent[i] = i; size_[i] = 1; }

        int[][] dirs = {{1,0},{0,1}}; // only need down/right to cover every adjacent pair once

        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 1) {
                    for (int[] d : dirs) {
                        int ni = i + d[0], nj = j + d[1];
                        if (ni < n && nj < n && grid[ni][nj] == 1) {
                            union(i * n + j, ni * n + nj);
                        }
                    }
                }
            }
        }

        int best = 0;
        boolean hasZero = false;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 1) {
                    best = Math.max(best, size_[find(i * n + j)]);
                }
            }
        }

        int[][] fourDirs = {{1,0},{-1,0},{0,1},{0,-1}};
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 0) {
                    hasZero = true;
                    Set<Integer> roots = new HashSet<>();
                    for (int[] d : fourDirs) {
                        int ni = i + d[0], nj = j + d[1];
                        if (ni >= 0 && ni < n && nj >= 0 && nj < n && grid[ni][nj] == 1) {
                            roots.add(find(ni * n + nj));
                        }
                    }
                    int total = 1;
                    for (int r : roots) total += size_[r];
                    best = Math.max(best, total);
                }
            }
        }
        return hasZero ? best : n * n;
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private void union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return;
        if (size_[ra] < size_[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        size_[ra] += size_[rb];
    }
}
```

## Key Takeaways
- Re-labeling islands with unique ids (>= 2) lets you distinguish "already counted this island for this 0-cell" via a `Set` of labels/roots — critical to avoid double-counting when a 0-cell touches the same island from two directions.
- Precompute all island sizes once (`O(n^2)`), then the second pass over every `0` cell is O(1) work per cell (at most 4 neighbor lookups) — don't re-flood-fill per candidate cell.
- If the grid contains no `0` at all, the answer is simply `n*n`; that edge case is easy to miss in both approaches.
