# Lowest Common Ancestor of a Binary Tree

**Difficulty:** Medium · **Pattern:** post-order DFS that bubbles up "which target(s) found below me" · [LeetCode](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/)

## Problem
Given the root of a binary tree and two of its nodes `p` and `q`, return their lowest common ancestor (LCA) — the deepest node that has both `p` and `q` as descendants (a node can be a descendant of itself).

## Examples
**Example 1**
```
Input:  root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1
Output: 3
Explanation: The LCA of nodes 5 and 1 is the root, 3.
```

**Example 2**
```
Input:  root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 4
Output: 5
Explanation: The LCA of 5 and 4 is 5, since 5 is an ancestor of 4 (and of itself).
```

## Constraints
- The number of nodes is in the range [2, 10^5].
- -10^9 <= Node.val <= 10^9
- All Node.val are unique.
- p != q
- p and q both exist in the tree.

## Approach 1 — Parent map + ancestor set
**Idea.** Do a BFS/DFS to build a `child -> parent` map for the whole tree. Walk up from `p` to the root, recording every ancestor in a set. Then walk up from `q` until hitting a node already in that set — that node is the LCA.
**Complexity.** Time O(n), Space O(n) for the parent map and ancestor set.
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        Map<TreeNode, TreeNode> parent = new HashMap<>();
        parent.put(root, null);
        Deque<TreeNode> stack = new ArrayDeque<>();
        stack.push(root);

        // BFS/DFS until both p and q have been discovered
        while (!parent.containsKey(p) || !parent.containsKey(q)) {
            TreeNode node = stack.pop();
            if (node.left != null) {
                parent.put(node.left, node);
                stack.push(node.left);
            }
            if (node.right != null) {
                parent.put(node.right, node);
                stack.push(node.right);
            }
        }

        Set<TreeNode> ancestors = new HashSet<>();
        TreeNode cur = p;
        while (cur != null) {
            ancestors.add(cur);
            cur = parent.get(cur);
        }

        cur = q;
        while (!ancestors.contains(cur)) {
            cur = parent.get(cur);
        }
        return cur;
    }
}
```

## Approach 2 — Single post-order DFS (optimal)
**Idea.** Recurse into left and right subtrees. If the current node is `p` or `q`, return it immediately (no need to look further down that branch). Otherwise, if both the left and right recursive calls return non-null, the current node is the split point — the LCA. If only one side returns non-null, propagate that result upward (the LCA lies in that subtree, or one of `p`/`q` is itself an ancestor of the other and got found first).
**Complexity.** Time O(n), Space O(h) recursion stack.
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;

        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);

        if (left != null && right != null) return root;  // p and q found on different sides
        return left != null ? left : right;               // both on one side (or not found)
    }
}
```

## Key Takeaways
- The post-order trick works because once a subtree returns non-null, it means "one of the targets (or their LCA) lives here" — a single bubbled-up node encodes enough information without extra state.
- Returning the node itself the moment it matches `p` or `q` correctly handles the ancestor-of-itself case (no need to search below `p` for `q` once `p` is found).
- The parent-map approach generalizes better if you need LCA for many query pairs against the same tree, or need actual ancestor paths; the recursive approach is the leaner single-query solution.
