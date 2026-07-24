# Binary Tree Cameras

**Difficulty:** Hard · **Pattern:** greedy post-order DFS with a 3-state encoding (uncovered / covered-no-camera / has-camera) · [LeetCode](https://leetcode.com/problems/binary-tree-cameras/)

## Problem
Each camera placed at a node can monitor that node, its parent, and its direct children. Find the minimum number of cameras needed so every node in the tree is monitored.

## Examples
**Example 1**
```
Input:  root = [0,0,null,0,0]
Output: 1
Explanation: One camera placed at the second-level node covers itself, its parent, and its two children.
```

**Example 2**
```
Input:  root = [0,0,null,0,null,0,null,null,0]
Output: 2
Explanation: Two cameras are needed to cover the chain of nodes.
```

## Constraints
- The number of nodes is in the range [1, 1000].
- Node.val == 0 for every node.

## Approach 1 — Brute-force state search (conceptual baseline)
**Idea.** Conceptually, try every subset of nodes as camera placements and check coverage, keeping the minimum valid subset size. This is exponential and only useful as a mental baseline before reaching for the greedy post-order encoding; it is not practical to implement directly for n up to 1000.
**Complexity.** Time O(2^n) (infeasible), Space O(n) for recursion/coverage tracking.
```java
// Conceptual only — illustrates why an exhaustive search is infeasible.
// For n nodes, there are 2^n camera placements to check; not implemented
// because it is exponential and superseded by Approach 2 below.
class BruteForceSketch {
    // pseudo-outline (not runnable at scale):
    // for each subset S of nodes:
    //     if S covers every node (self, parent, children): track min |S|
    // return min |S|
}
```

## Approach 2 — Greedy post-order DFS with 3 states (optimal)
**Idea.** Process children before parents (post-order) and greedily place a camera only when forced to. Define three states returned per subtree:
- `NOT_COVERED` (0): node has no camera and is not covered by any neighbor yet.
- `COVERED` (1): node has no camera but is covered by a child's camera.
- `HAS_CAMERA` (2): node itself has a camera.

For each node: if either child is `NOT_COVERED`, we must place a camera here (increment count, return `HAS_CAMERA`). Else if either child `HAS_CAMERA`, this node is covered by that child (return `COVERED`). Else (both children `COVERED` or null) this node is *not yet* covered — return `NOT_COVERED` and let the parent decide. Null children are treated as `COVERED` (a leaf shouldn't force its non-existent child to need anything). Finally, if the root itself ends up `NOT_COVERED`, place one more camera on it.
**Complexity.** Time O(n), Space O(h) recursion stack.
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    private static final int NOT_COVERED = 0;
    private static final int COVERED = 1;
    private static final int HAS_CAMERA = 2;

    private int cameras = 0;

    public int minCameraCover(TreeNode root) {
        if (dfs(root) == NOT_COVERED) {
            cameras++; // root itself needs a camera
        }
        return cameras;
    }

    private int dfs(TreeNode node) {
        if (node == null) return COVERED; // absent nodes never force a camera

        int left = dfs(node.left);
        int right = dfs(node.right);

        if (left == NOT_COVERED || right == NOT_COVERED) {
            cameras++;
            return HAS_CAMERA;
        }
        if (left == HAS_CAMERA || right == HAS_CAMERA) {
            return COVERED;
        }
        return NOT_COVERED;
    }
}
```

## Key Takeaways
- Greedy placement works here because deferring a camera to the parent is always at least as good as placing it at a leaf — leaves should never hold cameras in an optimal solution.
- Treating `null` children as `COVERED` is the key boundary condition: it stops leaves from being incorrectly forced into `NOT_COVERED` and triggering unnecessary cameras.
- The final root check (`if dfs(root) == NOT_COVERED, add one more camera`) is easy to forget — the root has no parent to place a camera on its behalf, so it must self-cover if it comes back uncovered.
