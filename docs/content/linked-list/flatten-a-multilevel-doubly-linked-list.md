# Flatten a Multilevel Doubly Linked List

**Difficulty:** Medium · **Pattern:** DFS/stack traversal of nested doubly linked lists with child pointers · [LeetCode](https://leetcode.com/problems/flatten-a-multilevel-doubly-linked-list/)

## Problem
You are given a doubly linked list where, in addition to `next` and `prev`, each node may have a `child` pointer to a separate doubly linked list (which may itself have nested children). Flatten the list so all nodes appear in a single-level doubly linked list, following the order implied by depth-first traversal, and set every `child` pointer to `null`.

## Examples
**Example 1**
```
Input:  head = [1,2,3,4,5,6,null,null,null,7,8,9,10,null,null,11,12]
         (node 3 has a child list 7->8->9->10, node 8 has a child list 11->12)
Output: [1,2,3,7,8,11,12,9,10,4,5,6]
Explanation: When we encounter a node with a child, we splice the entire child list in immediately after it, before continuing with what was originally its `next`.
```

**Example 2**
```
Input:  head = [1,2,null,3]
         (node 1 has child 3)
Output: [1,3,2]
Explanation: Child list of node 1 is inserted between node 1 and its original next (node 2).
```

## Constraints
- The number of nodes will not exceed `1000`.
- `1 <= Node.val <= 10^5`

## Approach 1 — Recursive DFS flatten
**Idea.** Process the list node by node. When a node has a `child`, recursively flatten the child sublist first, then splice: `node.next = flattenedChild`, `flattenedChild.prev = node`, and find the flattened child's tail to reconnect to the node's original `next`. Clear `child` after splicing.
**Complexity.** Time `O(n)` (every node visited once), Space `O(d)` recursion depth where `d` is nesting depth.
```java
class Node {
    public int val;
    public Node prev, next, child;
}

class Solution {
    public Node flatten(Node head) {
        flattenDFS(head);
        return head;
    }

    // returns the tail of the flattened list starting at 'head'
    private Node flattenDFS(Node head) {
        Node curr = head;
        Node lastNode = null;
        while (curr != null) {
            Node next = curr.next;
            if (curr.child != null) {
                Node childHead = curr.child;
                Node childTail = flattenDFS(childHead);

                curr.next = childHead;
                childHead.prev = curr;
                curr.child = null;

                childTail.next = next;
                if (next != null) next.prev = childTail;

                curr = next; // continue after the spliced-in child section
                lastNode = childTail;
            } else {
                lastNode = curr;
                curr = next;
            }
        }
        return lastNode;
    }
}
```

## Approach 2 — Iterative with explicit stack (optimal, avoids recursion)
**Idea.** Use a stack to simulate DFS without recursion. Push the current node's `next` (if any) before diving into its `child`, so it can be resumed later. Walk forward: whenever a node has a child, push the node's current `next` onto the stack, then descend into the child (set `next`/`prev` links, clear `child`). When `next` becomes null and the stack is non-empty, pop to resume the pending sibling.
**Complexity.** Time `O(n)`, Space `O(d)` for the stack in the worst case (all nodes nested), `O(1)` extra if lists are mostly flat.
```java
class Solution {
    public Node flatten(Node head) {
        if (head == null) return null;

        Deque<Node> stack = new ArrayDeque<>();
        Node curr = head;

        while (curr != null) {
            if (curr.child != null) {
                if (curr.next != null) {
                    stack.push(curr.next);
                }
                curr.next = curr.child;
                curr.next.prev = curr;
                curr.child = null;
            } else if (curr.next == null && !stack.isEmpty()) {
                Node resumed = stack.pop();
                curr.next = resumed;
                resumed.prev = curr;
            }
            curr = curr.next;
        }
        return head;
    }
}
```

## Key Takeaways
- Always null out `child` pointers after splicing — the problem explicitly requires it, and it's an easy field to forget.
- The recursive version's helper must return the *tail* of the flattened sublist so the caller can reconnect it to what followed the original node.
- The iterative stack version pushes only the pending `next` sibling (not the child), since the child is handled immediately by descending into it.
- Related: Flatten Binary Tree to Linked List (nearly identical DFS-splice pattern one level up in tree form).
