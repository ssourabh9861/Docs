# All Nodes Distance K in Binary Tree

**Difficulty:** Medium · **Pattern:** graph-ify the tree with a parent map, then BFS outward from the target node · [LeetCode](https://leetcode.com/problems/all-nodes-distance-k-in-binary-tree/)

## Problem
Given the root of a binary tree, a `target` node within that tree, and an integer `k`, return the values of all nodes that are exactly distance `k` from `target` (distance measured in edges, treating the tree as an undirected graph — parent and child edges are both traversable).

## Examples
**Example 1**
```
Input:  root = [3,5,1,6,2,0,8,null,null,7,4], target = 5, k = 2
Output: [7,4,1]
Explanation: 7 and 4 are 5's grandchildren (via 2); 1 is 5's sibling-parent-cousin, reached via parent 3.
```

**Example 2**
```
Input:  root = [1], target = 1, k = 3
Output: []
Explanation: No nodes exist at distance 3 from the only node in the tree.
```

## Constraints
- The number of nodes is in the range [1, 500].
- 0 <= Node.val <= 500
- All Node.val are unique.
- target is the value of one of the nodes in the tree.
- 0 <= k <= 1000

## Approach 1 — Build full adjacency list, then BFS
**Idea.** Traverse the tree once (DFS or BFS) to build an explicit adjacency list mapping each node value to its neighbors (parent, left child, right child) — effectively converting the tree into an undirected graph. Then run a standard BFS from `target`, tracking visited nodes and current distance; collect all node values discovered exactly at distance `k`.
**Complexity.** Time O(n), Space O(n) for the adjacency list and BFS queue/visited set.
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public List<Integer> distanceK(TreeNode root, TreeNode target, int k) {
        Map<Integer, List<Integer>> graph = new HashMap<>();
        buildGraph(root, null, graph);

        List<Integer> result = new ArrayList<>();
        Set<Integer> visited = new HashSet<>();
        Queue<Integer> queue = new LinkedList<>();
        queue.offer(target.val);
        visited.add(target.val);

        int distance = 0;
        while (!queue.isEmpty()) {
            int size = queue.size();
            if (distance == k) {
                result.addAll(queue);
                return result;
            }
            for (int i = 0; i < size; i++) {
                int cur = queue.poll();
                for (int neighbor : graph.getOrDefault(cur, Collections.emptyList())) {
                    if (!visited.contains(neighbor)) {
                        visited.add(neighbor);
                        queue.offer(neighbor);
                    }
                }
            }
            distance++;
        }
        return result; // k exceeded reachable distance
    }

    private void buildGraph(TreeNode node, TreeNode parent, Map<Integer, List<Integer>> graph) {
        if (node == null) return;
        graph.putIfAbsent(node.val, new ArrayList<>());
        if (parent != null) {
            graph.get(node.val).add(parent.val);
            graph.get(parent.val).add(node.val);
        }
        buildGraph(node.left, node, graph);
        buildGraph(node.right, node, graph);
    }
}
```

## Approach 2 — DFS to link parents, then BFS with a visited-node-pointer set (optimal, avoids value-based map)
**Idea.** Instead of building a value-keyed graph, do a single DFS from `root` that sets a `parent` pointer on every node (stored in a `Map<TreeNode, TreeNode>`). This effectively makes the tree traversable in 3 directions (`left`, `right`, `parent`) without materializing a full adjacency list. Then BFS from `target`, at each step expanding to `left`, `right`, and `parent`, using a `Set<TreeNode>` to avoid revisiting. Stop and collect when the BFS layer count equals `k`.
**Complexity.** Time O(n), Space O(n) for the parent map, visited set, and queue.
```java
import java.util.*;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

class Solution {
    public List<Integer> distanceK(TreeNode root, TreeNode target, int k) {
        Map<TreeNode, TreeNode> parent = new HashMap<>();
        markParents(root, null, parent);

        Set<TreeNode> visited = new HashSet<>();
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(target);
        visited.add(target);

        int distance = 0;
        while (!queue.isEmpty()) {
            if (distance == k) {
                List<Integer> result = new ArrayList<>();
                for (TreeNode node : queue) result.add(node.val);
                return result;
            }
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                TreeNode cur = queue.poll();
                for (TreeNode neighbor : new TreeNode[]{cur.left, cur.right, parent.get(cur)}) {
                    if (neighbor != null && !visited.contains(neighbor)) {
                        visited.add(neighbor);
                        queue.offer(neighbor);
                    }
                }
            }
            distance++;
        }
        return new ArrayList<>(); // k exceeded reachable distance
    }

    private void markParents(TreeNode node, TreeNode parentNode, Map<TreeNode, TreeNode> parent) {
        if (node == null) return;
        parent.put(node, parentNode);
        markParents(node.left, node, parent);
        markParents(node.right, node, parent);
    }
}
```

## Key Takeaways
- The core insight is graph-ifying the tree: adding a `parent` link (implicitly or via a map) turns a tree into an undirected graph, letting BFS travel upward as freely as downward.
- BFS layer-by-layer (tracking queue size per level) is the natural way to stop exactly at distance `k` — no need to compute distances for every node in the tree.
- Values must be unique to safely key a graph by `node.val` (Approach 1); using `TreeNode` object identity as the map key (Approach 2) sidesteps that assumption and is the more robust general pattern.
