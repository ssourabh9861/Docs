# Maximum Sum BST in Binary Tree

**Difficulty:** Hard · **Pattern:** post-order DFS returning a tuple state (isValidBST, min, max, sum) per subtree · [LeetCode](https://leetcode.com/problems/maximum-sum-bst-in-binary-tree/)

## Problem
Given a binary tree, find the maximum sum of node values among all subtrees that are valid binary search trees. Return 0 if no such subtree exists.

## Examples
**Example 1**
```
Input:  root = [1,4,3,2,4,2,5,null,null,null,null,null,null,4,6]
Output: 20
Explanation: The subtree rooted at the node with value 3 (containing 3, 2, 5, 4, 6) is a valid BST with sum 20.
```

**Example 2**
```
Input:  root = [4,3,null,1,2]
Output: 2
Explanation: The only valid non-trivial BST subtree is the single node with value 2 (the whole tree is invalid since 4's left subtree contains 3, but also 1 and 2 which violate BST ordering relative to 3 and 4 together).
```

## Constraints
- The number of nodes is in the range [1, 4 * 10^4].
- -4 * 10^4 <= Node.val <= 4 * 10^4

## Approach 1 — Validate every subtree independently
**Idea.** For every node in the tree, run a separate "is this a valid BST" check (with min/max bound validation) plus a separate "sum of this subtree" pass. Track the maximum sum among all nodes whose subtree passes validation. This redoes work: validating a subtree at every possible root means overlapping subtrees get re-scanned repeatedly.
**Complexity.** Time O(n^2) worst case (skewed tree, each validation is O(n)), Space O(h) recursion stack.
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public int maxSumBST(TreeNode root) {
        int[] best = {0};
        checkEveryNode(root, best);
        return best[0];
    }

    private void checkEveryNode(TreeNode node, int[] best) {
        if (node == null) return;
        if (isValidBST(node, Long.MIN_VALUE, Long.MAX_VALUE)) {
            best[0] = Math.max(best[0], sumOf(node));
        }
        checkEveryNode(node.left, best);
        checkEveryNode(node.right, best);
    }

    private boolean isValidBST(TreeNode node, long lower, long upper) {
        if (node == null) return true;
        if (node.val <= lower || node.val >= upper) return false;
        return isValidBST(node.left, lower, node.val) && isValidBST(node.right, node.val, upper);
    }

    private int sumOf(TreeNode node) {
        if (node == null) return 0;
        return node.val + sumOf(node.left) + sumOf(node.right);
    }
}
```

## Approach 2 — Single post-order DFS returning a tuple state (optimal)
**Idea.** Each recursive call returns a small state object for its subtree: `{isBST, min, max, sum}`. Combine children's states at the current node in O(1): the subtree rooted here is a valid BST iff both children are valid BSTs and `node.val` is strictly greater than the left subtree's max and strictly less than the right subtree's min. If valid, its sum is `leftSum + node.val + rightSum`, its min/max extend from children (or default to `node.val` for missing children), and the running global maximum is updated. If invalid, propagate an "invalid" sentinel upward so ancestors correctly fail too.
**Complexity.** Time O(n), Space O(h) recursion stack.
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    private int maxSum = 0;

    // encodes subtree validity + bounds + sum in one bundle
    private static class State {
        boolean isBST;
        long min, max;
        int sum;

        State(boolean isBST, long min, long max, int sum) {
            this.isBST = isBST;
            this.min = min;
            this.max = max;
            this.sum = sum;
        }
    }

    public int maxSumBST(TreeNode root) {
        dfs(root);
        return maxSum;
    }

    private State dfs(TreeNode node) {
        if (node == null) {
            // neutral element: valid, bounds chosen so any parent comparison passes
            return new State(true, Long.MAX_VALUE, Long.MIN_VALUE, 0);
        }

        State left = dfs(node.left);
        State right = dfs(node.right);

        boolean isBST = left.isBST && right.isBST
                && node.val > left.max && node.val < right.min;

        if (!isBST) {
            return new State(false, 0, 0, 0);
        }

        long min = Math.min(node.val, left.min);
        long max = Math.max(node.val, right.max);
        int sum = node.val + left.sum + right.sum;

        maxSum = Math.max(maxSum, sum);
        return new State(true, min, max, sum);
    }
}
```

## Key Takeaways
- Bundling multiple facts (`isBST`, `min`, `max`, `sum`) into one returned tuple/state object is the general pattern for tree problems needing several pieces of information from each subtree simultaneously — it converts O(n^2) repeated validation into a single O(n) pass.
- The null-node "neutral element" (`min = +infinity`, `max = -infinity`) is what lets leaf nodes trivially satisfy the BST bound comparisons without special-casing leaves separately.
- Once a subtree is found invalid, its exact min/max/sum no longer matter — only that "invalid" propagates upward so no ancestor mistakenly qualifies as a BST.
