# Number of Islands II

**Difficulty:** Hard · **Pattern:** Union-Find (DSU) — incremental online connectivity as land cells are added one at a time · [LeetCode](https://leetcode.com/problems/number-of-islands-ii/)

## Problem
Given an `m x n` grid initially all water, process a sequence of `positions` where each turns one cell into land. After each addition, report the current number of islands (maximal 4-directionally connected land groups).

## Examples
**Example 1**
```
Input:  m = 3, n = 3, positions = [[0,0],[0,1],[1,2],[2,1]]
Output: [1,1,2,3]
Explanation: Each new land cell either starts a new island, extends one, or (not in this example) merges two.
```
**Example 2**
```
Input:  m = 1, n = 1, positions = [[0,0]]
Output: [1]
Explanation: Single cell added, one island.
```

## Constraints
- 1 <= m, n <= 10^4
- 1 <= positions.length <= 10^4
- positions[i].length == 2
- 0 <= positions[i][0] < m, 0 <= positions[i][1] < n

## Approach 1 — Naive: BFS/DFS flood-fill recount after every addition
**Idea.** After adding each land cell, scan the whole grid (or run flood fill from every land cell) to count connected components from scratch. Correct but far too slow for large grids/position counts — included only as the baseline to beat.
**Complexity.** Time O(k · m · n) for k additions, Space O(m · n).
```java
class Solution {
    public List<Integer> numIslands2(int m, int n, int[][] positions) {
        boolean[][] grid = new boolean[m][n];
        List<Integer> result = new ArrayList<>();

        for (int[] pos : positions) {
            grid[pos[0]][pos[1]] = true;
            result.add(countIslands(grid, m, n));
        }
        return result;
    }

    private int countIslands(boolean[][] grid, int m, int n) {
        boolean[][] visited = new boolean[m][n];
        int count = 0;
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] && !visited[i][j]) {
                    count++;
                    flood(grid, visited, i, j, m, n);
                }
            }
        }
        return count;
    }

    private void flood(boolean[][] grid, boolean[][] visited, int i, int j, int m, int n) {
        if (i < 0 || i >= m || j < 0 || j >= n || visited[i][j] || !grid[i][j]) return;
        visited[i][j] = true;
        flood(grid, visited, i + 1, j, m, n);
        flood(grid, visited, i - 1, j, m, n);
        flood(grid, visited, i, j + 1, m, n);
        flood(grid, visited, i, j - 1, m, n);
    }
}
```

## Approach 2 — Union-Find, incremental island count (optimal)
**Idea.** Maintain a DSU over all `m*n` cells (only "activated" ones matter). When a cell is added: if already land, repeat previous count. Otherwise mark it land, increment a running `islandCount`, then check its 4 neighbors — for each neighbor that is land and in a *different* DSU component, union them and decrement `islandCount` (merging two islands into one). Append `islandCount` after each step.
**Complexity.** Time O(k · α(mn)) for k positions, Space O(m · n).
```java
class Solution {
    private int[] parent, rank_;

    public List<Integer> numIslands2(int m, int n, int[][] positions) {
        parent = new int[m * n];
        rank_ = new int[m * n];
        Arrays.fill(parent, -1); // -1 marks water / inactive cell

        boolean[][] isLand = new boolean[m][n];
        List<Integer> result = new ArrayList<>();
        int islandCount = 0;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

        for (int[] pos : positions) {
            int r = pos[0], c = pos[1];
            if (isLand[r][c]) {
                result.add(islandCount);
                continue;
            }
            isLand[r][c] = true;
            int idx = r * n + c;
            parent[idx] = idx;
            islandCount++;

            for (int[] d : dirs) {
                int nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < m && nc >= 0 && nc < n && isLand[nr][nc]) {
                    int nIdx = nr * n + nc;
                    if (union(idx, nIdx)) {
                        islandCount--;
                    }
                }
            }
            result.add(islandCount);
        }
        return result;
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        if (rank_[ra] < rank_[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        if (rank_[ra] == rank_[rb]) rank_[ra]++;
        return true;
    }
}
```

## Key Takeaways
- Classic "online" connectivity problem — DSU shines exactly when connectivity queries/updates interleave over time instead of being computed once on a static graph.
- Initialize `parent[idx] = -1` (or leave unset) for water cells and only set `parent[idx] = idx` when a cell becomes land, so inactive cells never pollute unions.
- `islandCount` increments by 1 on every new land cell and decrements by 1 per successful union with a distinct neighboring component — duplicate positions must be detected and skipped (they don't change the count).
