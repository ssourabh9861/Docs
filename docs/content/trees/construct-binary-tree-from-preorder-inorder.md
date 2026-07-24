# Construct Binary Tree from Preorder and Inorder Traversal

**Difficulty:** Medium · **Pattern:** recursive divide using preorder's root pointer + inorder-index hash map to split subtrees · [LeetCode](https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/)

## Problem
Given two integer arrays `preorder` and `inorder` representing the preorder and inorder traversal of a binary tree (no duplicate values), reconstruct and return the binary tree.

## Examples
**Example 1**
```
Input:  preorder = [3,9,20,15,7], inorder = [9,3,15,20,7]
Output: [3,9,20,null,null,15,7]
Explanation: preorder[0]=3 is the root; inorder splits into left={9}, right={15,20,7}.
```

**Example 2**
```
Input:  preorder = [-1], inorder = [-1]
Output: [-1]
Explanation: Single-node tree.
```

## Constraints
- 1 <= preorder.length <= 3000
- inorder.length == preorder.length
- -3000 <= preorder[i], inorder[i] <= 3000
- preorder and inorder consist of unique values.
- Every value of inorder also appears in preorder.
- preorder is guaranteed to be the preorder traversal of the tree; inorder is guaranteed to be the inorder traversal.

## Approach 1 — Recursion with linear array search
**Idea.** The first element of `preorder` is always the root. Find that value's position in `inorder` (linear scan) — everything left of it belongs to the left subtree, everything right belongs to the right subtree. Recurse on the corresponding slices, tracking a shared preorder index since preorder is consumed root, left-subtree, right-subtree in order.
**Complexity.** Time O(n^2) worst case (linear search per node), Space O(n) for recursion and slice bookkeeping.
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    private int[] preorder;
    private int preIndex = 0;

    public TreeNode buildTree(int[] preorder, int[] inorder) {
        this.preorder = preorder;
        return build(inorder, 0, inorder.length - 1);
    }

    private TreeNode build(int[] inorder, int inStart, int inEnd) {
        if (inStart > inEnd) return null;

        int rootVal = preorder[preIndex++];
        TreeNode root = new TreeNode(rootVal);

        // linear search for the root's position in this inorder range
        int splitIndex = inStart;
        for (int i = inStart; i <= inEnd; i++) {
            if (inorder[i] == rootVal) {
                splitIndex = i;
                break;
            }
        }

        root.left = build(inorder, inStart, splitIndex - 1);
        root.right = build(inorder, splitIndex + 1, inEnd);
        return root;
    }
}
```

## Approach 2 — Hash map index lookup (optimal)
**Idea.** Precompute a value-to-index map for `inorder` so the root's split position is found in O(1). Keep the same recursive structure: consume `preorder` left to right with a running index, use the map to instantly split the current inorder range into left/right, and recurse.
**Complexity.** Time O(n), Space O(n) for the map and recursion stack.
```java
import java.util.HashMap;
import java.util.Map;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    private int[] preorder;
    private int preIndex = 0;
    private Map<Integer, Integer> inorderIndex = new HashMap<>();

    public TreeNode buildTree(int[] preorder, int[] inorder) {
        this.preorder = preorder;
        for (int i = 0; i < inorder.length; i++) {
            inorderIndex.put(inorder[i], i);
        }
        return build(0, inorder.length - 1);
    }

    private TreeNode build(int inStart, int inEnd) {
        if (inStart > inEnd) return null;

        int rootVal = preorder[preIndex++];
        TreeNode root = new TreeNode(rootVal);

        int splitIndex = inorderIndex.get(rootVal);

        root.left = build(inStart, splitIndex - 1);
        root.right = build(splitIndex + 1, inEnd);
        return root;
    }
}
```

## Key Takeaways
- Preorder gives roots in the exact order they must be attached; inorder gives the left/right split for whichever root is currently active — the two traversals are complementary, not redundant.
- Precomputing value -> index for inorder turns the split lookup from O(n) into O(1), the single change that takes this from O(n^2) to O(n).
- Always build the left subtree before the right subtree in the recursion, since that matches how preorder was produced (root, then entire left subtree, then entire right subtree) and keeps the shared `preIndex` correct.
