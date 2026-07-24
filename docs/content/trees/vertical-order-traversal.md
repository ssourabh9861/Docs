# Vertical Order Traversal of a Binary Tree

**Difficulty:** Hard · **Pattern:** BFS/DFS tagging each node with (column, row) then grouping by column, sorted by row then value · [LeetCode](https://leetcode.com/problems/vertical-order-traversal-of-a-binary-tree/)

## Problem
Assign the root column index 0; each left child gets `col - 1` and each right child `col + 1`, with row increasing by 1 per depth level. Group node values by column (left to right), and within each column order by row (top to bottom); if two nodes share both row and column, order by value ascending.

## Examples
**Example 1**
```
Input:  root = [3,9,20,null,null,15,7]
Output: [[9],[3,15],[20],[7]]
Explanation: Column -1: [9]. Column 0: [3, 15] (3 at row 0, 15 at row 2). Column 1: [20]. Column 2: [7].
```

**Example 2**
```
Input:  root = [1,2,3,4,5,6,7]
Output: [[4],[2],[1,5,6],[3],[7]]
Explanation: Nodes 5 and 6 share column 0 but different rows (both row 2 here since 5 and 6 are siblings' children... ordering resolved by row then value).
```

## Constraints
- The number of nodes is in the range [1, 1000].
- 0 <= Node.val <= 1000

## Approach 1 — DFS collecting (col, row, val) then sort everything
**Idea.** DFS the tree once, recording a triple `(col, row, val)` for every node into a flat list. Sort the entire list by column, then row, then value. Finally, group consecutive equal-column entries into output sub-lists.
**Complexity.** Time O(n log n) for the sort, Space O(n).
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public List<List<Integer>> verticalTraversal(TreeNode root) {
        List<int[]> entries = new ArrayList<>(); // {col, row, val}
        dfs(root, 0, 0, entries);

        entries.sort((a, b) -> {
            if (a[0] != b[0]) return Integer.compare(a[0], b[0]);
            if (a[1] != b[1]) return Integer.compare(a[1], b[1]);
            return Integer.compare(a[2], b[2]);
        });

        List<List<Integer>> result = new ArrayList<>();
        int prevCol = Integer.MIN_VALUE;
        for (int[] e : entries) {
            if (e[0] != prevCol) {
                result.add(new ArrayList<>());
                prevCol = e[0];
            }
            result.get(result.size() - 1).add(e[2]);
        }
        return result;
    }

    private void dfs(TreeNode node, int col, int row, List<int[]> entries) {
        if (node == null) return;
        entries.add(new int[]{col, row, node.val});
        dfs(node.left, col - 1, row + 1, entries);
        dfs(node.right, col + 1, row + 1, entries);
    }
}
```

## Approach 2 — TreeMap of column -> TreeMap of row -> sorted values (optimal structure)
**Idea.** Use a `TreeMap<Integer, TreeMap<Integer, PriorityQueue<Integer>>>` keyed by column then row, where each row bucket is a min-heap (or sorted list) of values. A BFS (or DFS) populates this nested structure; because `TreeMap` keeps keys sorted, iterating columns in order and rows in order — draining each row's heap — produces the answer directly without a final full sort over all n elements at once (each column/row bucket sorts only its own, typically small, group).
**Complexity.** Time O(n log n) overall (dominated by heap/map operations across all nodes, but structured incrementally rather than one big sort), Space O(n).
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public List<List<Integer>> verticalTraversal(TreeNode root) {
        // column -> row -> min-heap of values at that (column, row)
        TreeMap<Integer, TreeMap<Integer, PriorityQueue<Integer>>> columns = new TreeMap<>();

        Queue<TreeNode> nodeQueue = new LinkedList<>();
        Queue<int[]> posQueue = new LinkedList<>(); // {col, row}
        nodeQueue.offer(root);
        posQueue.offer(new int[]{0, 0});

        while (!nodeQueue.isEmpty()) {
            TreeNode node = nodeQueue.poll();
            int[] pos = posQueue.poll();
            int col = pos[0], row = pos[1];

            columns.computeIfAbsent(col, k -> new TreeMap<>())
                   .computeIfAbsent(row, k -> new PriorityQueue<>())
                   .offer(node.val);

            if (node.left != null) {
                nodeQueue.offer(node.left);
                posQueue.offer(new int[]{col - 1, row + 1});
            }
            if (node.right != null) {
                nodeQueue.offer(node.right);
                posQueue.offer(new int[]{col + 1, row + 1});
            }
        }

        List<List<Integer>> result = new ArrayList<>();
        for (TreeMap<Integer, PriorityQueue<Integer>> rows : columns.values()) {
            List<Integer> colValues = new ArrayList<>();
            for (PriorityQueue<Integer> bucket : rows.values()) {
                while (!bucket.isEmpty()) {
                    colValues.add(bucket.poll());
                }
            }
            result.add(colValues);
        }
        return result;
    }
}
```

## Key Takeaways
- The tie-break rule (same column *and* row -> sort by value) is the detail that trips people up; a naive BFS that only tracks column will misorder siblings that land in the same cell.
- Tracking `(col, row)` pairs alongside nodes — via a parallel queue in BFS or extra parameters in DFS — is the general technique for any "grid position of a tree node" problem.
- Nested `TreeMap`s give sorted iteration "for free" on both keys, trading a single big sort for many small sorted-insert operations — useful when columns/rows are processed incrementally (e.g., streaming).
