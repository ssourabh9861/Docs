# Binary Tree Maximum Path Sum

**Difficulty:** Hard · **Pattern:** post-order DFS returning "best downward branch" + global max across a "bridge" path · [LeetCode](https://leetcode.com/problems/binary-tree-maximum-path-sum/)

## Problem
A path is any sequence of nodes connected by parent-child edges, need not pass through the root, and each node appears at most once. Return the maximum sum of node values along any such path.

## Examples
**Example 1**
```
Input:  root = [1,2,3]
Output: 6
Explanation: The path 2 -> 1 -> 3 has sum 6.
```

**Example 2**
```
Input:  root = [-10,9,20,null,null,15,7]
Output: 42
Explanation: The path 15 -> 20 -> 7 has sum 42; the root is not needed.
```

## Constraints
- The number of nodes is in the range [1, 3 * 10^4].
- -1000 <= Node.val <= 1000

## Approach 1 — Brute force: recompute path sums per node
**Idea.** For every node, treat it as the "top" of a path and compute the best downward sum on each side (recursively, re-deriving the max single-arm sum for every subtree independently). This duplicates work because the downward-max for a subtree gets recomputed by every ancestor that considers it as a candidate top.
**Complexity.** Time O(n^2) worst case (skewed tree), Space O(h) recursion stack.
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public int maxPathSum(TreeNode root) {
        int[] best = {Integer.MIN_VALUE};
        collectTops(root, best);
        return best[0];
    }

    // treats every node as a potential path "top" and evaluates it directly
    private void collectTops(TreeNode node, int[] best) {
        if (node == null) return;
        int left = Math.max(0, downwardMax(node.left));
        int right = Math.max(0, downwardMax(node.right));
        best[0] = Math.max(best[0], node.val + left + right);
        collectTops(node.left, best);
        collectTops(node.right, best);
    }

    // recomputed from scratch for each caller -> redundant work
    private int downwardMax(TreeNode node) {
        if (node == null) return 0;
        int left = Math.max(0, downwardMax(node.left));
        int right = Math.max(0, downwardMax(node.right));
        return node.val + Math.max(left, right);
    }
}
```

## Approach 2 — Single post-order DFS with global max (optimal)
**Idea.** Do one post-order traversal. For each node, `gain(node)` returns the best sum achievable going *down* into a single child branch (negative contributions are clamped to 0, since we can simply not extend the path there). While computing that, also evaluate the "bridge" candidate `node.val + leftGain + rightGain` — the best path that uses `node` as its highest point, bending through both children — and fold it into a global maximum. Only the single-branch gain is returned upward, because a path returned to the parent cannot fork.
**Complexity.** Time O(n), Space O(h) recursion stack (O(n) worst case for a skewed tree).
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    private int maxSum = Integer.MIN_VALUE;

    public int maxPathSum(TreeNode root) {
        gain(root);
        return maxSum;
    }

    private int gain(TreeNode node) {
        if (node == null) return 0;

        int leftGain = Math.max(gain(node.left), 0);
        int rightGain = Math.max(gain(node.right), 0);

        // best path that turns at this node (uses both branches)
        int bridgeSum = node.val + leftGain + rightGain;
        maxSum = Math.max(maxSum, bridgeSum);

        // what we can actually hand back to the parent: one branch only
        return node.val + Math.max(leftGain, rightGain);
    }
}
```

## Key Takeaways
- Distinguish "value returned to parent" (single arm, must stay linear) from "value used to update the answer" (can bend through both children) — this split is the core trick for all max-path-sum-style tree DFS problems.
- Clamp negative branch contributions to 0 so a bad subtree never drags the path down; this naturally allows a path to start fresh at any node.
- One post-order pass suffices; recomputing per-node subtree sums (Approach 1) is the classic redundant-recursion pitfall on trees.
