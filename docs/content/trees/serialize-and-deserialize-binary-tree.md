# Serialize and Deserialize Binary Tree

**Difficulty:** Hard · **Pattern:** preorder DFS with explicit null markers, encode/decode as a delimited string · [LeetCode](https://leetcode.com/problems/serialize-and-deserialize-binary-tree/)

## Problem
Design an algorithm to convert a binary tree to a string (`serialize`) and back to the identical tree structure (`deserialize`). No constraints on the algorithm itself — only that a round trip reproduces the same tree.

## Examples
**Example 1**
```
Input:  root = [1,2,3,null,null,4,5]
Output: [1,2,3,null,null,4,5]
Explanation: serialize(root) then deserialize(...) returns a tree identical in structure and values.
```

**Example 2**
```
Input:  root = []
Output: []
Explanation: An empty tree serializes to a sentinel string and deserializes back to null.
```

## Constraints
- The number of nodes is in the range [0, 10^4].
- -1000 <= Node.val <= 1000

## Approach 1 — Level-order (BFS) with null placeholders
**Idea.** Serialize via BFS, writing "null" for missing children so the shape is fully recoverable. Deserialize by re-running the same BFS pattern: pop a token for each queued parent's left and right child.
**Complexity.** Time O(n) for both operations, Space O(n) for the queue and output string.
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class Codec {

    public String serialize(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            TreeNode node = queue.poll();
            if (node == null) {
                sb.append("null,");
                continue;
            }
            sb.append(node.val).append(',');
            queue.offer(node.left);
            queue.offer(node.right);
        }
        return sb.toString();
    }

    public TreeNode deserialize(String data) {
        String[] tokens = data.split(",");
        if (tokens.length == 0 || tokens[0].equals("null")) return null;

        TreeNode root = new TreeNode(Integer.parseInt(tokens[0]));
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int i = 1;
        while (!queue.isEmpty() && i < tokens.length) {
            TreeNode parent = queue.poll();
            if (!tokens[i].equals("null")) {
                parent.left = new TreeNode(Integer.parseInt(tokens[i]));
                queue.offer(parent.left);
            }
            i++;
            if (i < tokens.length && !tokens[i].equals("null")) {
                parent.right = new TreeNode(Integer.parseInt(tokens[i]));
                queue.offer(parent.right);
            }
            i++;
        }
        return root;
    }
}
```

## Approach 2 — Preorder DFS with null markers (optimal, simplest)
**Idea.** Serialize with a preorder traversal, emitting "#" for every null child so structure is unambiguous. Deserialize by consuming the token stream in the same preorder order: read a token, if it's "#" return null, otherwise build the node and recursively fill left then right from the remaining stream. Using a shared iterator/queue avoids index bookkeeping.
**Complexity.** Time O(n) for both operations, Space O(n) for the string and recursion stack.
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class Codec {

    public String serialize(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        buildString(root, sb);
        return sb.toString();
    }

    private void buildString(TreeNode node, StringBuilder sb) {
        if (node == null) {
            sb.append("#,");
            return;
        }
        sb.append(node.val).append(',');
        buildString(node.left, sb);
        buildString(node.right, sb);
    }

    public TreeNode deserialize(String data) {
        Deque<String> tokens = new ArrayDeque<>(Arrays.asList(data.split(",")));
        return buildTree(tokens);
    }

    private TreeNode buildTree(Deque<String> tokens) {
        String token = tokens.poll();
        if (token == null || token.equals("#")) return null;

        TreeNode node = new TreeNode(Integer.parseInt(token));
        node.left = buildTree(tokens);
        node.right = buildTree(tokens);
        return node;
    }
}
```

## Key Takeaways
- Null markers are what make a traversal reversible — without them, preorder/level-order alone cannot disambiguate shape (e.g., a left-only chain vs. a right-only chain).
- Preorder + recursion mirrors the natural recursive tree definition, making deserialization a direct inverse of serialization — often less bookkeeping than BFS with index math.
- A `Deque`/queue of tokens lets deserialization consume the stream in traversal order without manual index tracking, avoiding off-by-one errors.
