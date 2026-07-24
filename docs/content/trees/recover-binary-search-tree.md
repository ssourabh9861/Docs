# Recover Binary Search Tree

**Difficulty:** Hard · **Pattern:** inorder traversal to find the two swapped nodes (via prev-pointer tracking); Morris traversal for O(1) space · [LeetCode](https://leetcode.com/problems/recover-binary-search-tree/)

## Problem
Exactly two nodes of a BST have had their values swapped by mistake, corrupting the BST property. Recover the tree by fixing it in place (without changing its structure), so it becomes a valid BST again.

## Examples
**Example 1**
```
Input:  root = [1,3,null,null,2]
Output: [3,1,null,null,2]
Explanation: Before the fix, an inorder traversal reads 1,3,2 (a BST should read 1,2,3). Swapping the values of nodes 1 and 3 restores inorder to 1,2,3.
```

**Example 2**
```
Input:  root = [3,1,4,null,null,2]
Output: [2,1,4,null,null,3]
Explanation: 2 and 3 were swapped; swapping their values back yields inorder 1,2,3,4.
```

## Constraints
- The number of nodes is in the range [2, 1000].
- -2^31 <= Node.val <= 2^31 - 1
- It is guaranteed that the tree was a valid BST before being modified by the swap of exactly two distinct nodes' values.

## Approach 1 — Inorder traversal into a list, then find and fix
**Idea.** Collect all node references via inorder traversal into a list (inorder of a valid BST is strictly increasing, so any drop signals a misplaced value). Scan the list for the two indices where `list[i].val > list[i+1].val`; the first violation's left element and the last violation's right element are exactly the two swapped nodes (handles both adjacent and non-adjacent swaps). Swap their `.val` fields.
**Complexity.** Time O(n), Space O(n) for storing all node references.
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public void recoverTree(TreeNode root) {
        List<TreeNode> inorder = new ArrayList<>();
        collect(root, inorder);

        TreeNode first = null, second = null;
        for (int i = 0; i < inorder.size() - 1; i++) {
            if (inorder.get(i).val > inorder.get(i + 1).val) {
                if (first == null) {
                    first = inorder.get(i);       // first violation's left node
                }
                second = inorder.get(i + 1);       // keeps updating to the last violation's right node
            }
        }

        int tmp = first.val;
        first.val = second.val;
        second.val = tmp;
    }

    private void collect(TreeNode node, List<TreeNode> inorder) {
        if (node == null) return;
        collect(node.left, inorder);
        inorder.add(node);
        collect(node.right, inorder);
    }
}
```

## Approach 2 — Morris inorder traversal, O(1) space (optimal)
**Idea.** Use Morris traversal to visit nodes in inorder without recursion or an explicit stack: for each node, if it has a left child, find its inorder predecessor (rightmost node in the left subtree) and thread a temporary link from that predecessor back to the current node, allowing traversal to "return" after finishing the left subtree; the thread is removed once used. While visiting nodes in this O(1)-space traversal, track `prev` and detect the same two violation points as Approach 1.
**Complexity.** Time O(n), Space O(1) (aside from the temporary threads, which are all removed by the end).
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public void recoverTree(TreeNode root) {
        TreeNode first = null, second = null, prev = null;
        TreeNode cur = root;

        while (cur != null) {
            if (cur.left != null) {
                TreeNode predecessor = cur.left;
                while (predecessor.right != null && predecessor.right != cur) {
                    predecessor = predecessor.right;
                }

                if (predecessor.right == null) {
                    predecessor.right = cur; // thread back to cur
                    cur = cur.left;
                } else {
                    predecessor.right = null; // remove thread, we're done with left subtree

                    if (prev != null && prev.val > cur.val) {
                        if (first == null) first = prev;
                        second = cur;
                    }
                    prev = cur;
                    cur = cur.right;
                }
            } else {
                if (prev != null && prev.val > cur.val) {
                    if (first == null) first = prev;
                    second = cur;
                }
                prev = cur;
                cur = cur.right;
            }
        }

        int tmp = first.val;
        first.val = second.val;
        second.val = tmp;
    }
}
```

## Key Takeaways
- The two-violation-point logic (`first = first violation's earlier node`, `second = last violation's later node`) correctly handles both cases: adjacent swapped nodes (one violation) and non-adjacent swapped nodes (two violations).
- Morris traversal achieves O(1) space by temporarily repurposing null right pointers as threads back to ancestors, then cleaning them up — a technique worth memorizing for any "inorder without recursion/stack" requirement.
- Only `.val` fields are swapped, not the nodes themselves — the problem asks to fix the tree "without changing its structure," so pointer surgery is unnecessary and wrong here.
