# Copy List with Random Pointer

**Difficulty:** Medium · **Pattern:** Interleaving deep copy for O(1) extra space (also HashMap approach) · [LeetCode](https://leetcode.com/problems/copy-list-with-random-pointer/)

## Problem
A linked list of length `n` has each node holding an additional `random` pointer that could point to any node in the list, or `null`. Construct a deep copy of the list — the copied list must consist of exactly `n` brand-new nodes with correct `next` and `random` links, and must not reference the original list.

## Examples
**Example 1**
```
Input:  head = [[7,null],[13,0],[11,4],[10,2],[1,0]]
Output: [[7,null],[13,0],[11,4],[10,2],[1,0]]
Explanation: Each pair is [val, random_index]. The output is a fully independent copy with the same structure.
```

**Example 2**
```
Input:  head = [[1,1],[2,1]]
Output: [[1,1],[2,1]]
Explanation: Node 1's random points to itself; node 2's random points to node 1. The copy preserves these relationships between new nodes.
```

## Constraints
- `0 <= n <= 1000`
- `-10^4 <= Node.val <= 10^4`
- `Node.random` is `null` or points to some node in the linked list.

## Approach 1 — HashMap (original → copy)
**Idea.** First pass: create a copy of each node and map `original -> copy` in a HashMap. Second pass: for each original node, set `copy.next = map.get(original.next)` and `copy.random = map.get(original.random)`.
**Complexity.** Time `O(n)`, Space `O(n)` for the map.
```java
class Node {
    int val;
    Node next;
    Node random;
    Node(int val) {
        this.val = val;
        this.next = null;
        this.random = null;
    }
}

class Solution {
    public Node copyRandomList(Node head) {
        if (head == null) return null;

        Map<Node, Node> map = new HashMap<>();
        Node curr = head;
        while (curr != null) {
            map.put(curr, new Node(curr.val));
            curr = curr.next;
        }

        curr = head;
        while (curr != null) {
            Node copy = map.get(curr);
            copy.next = map.get(curr.next);     // null-safe: map.get(null) returns null
            copy.random = map.get(curr.random);
            curr = curr.next;
        }
        return map.get(head);
    }
}
```

## Approach 2 — Interleave in place (optimal, O(1) space)
**Idea.** Three passes over the original list, no extra map:
1. For each original node `A`, insert a copy `A'` right after it: `A -> A' -> B -> B' -> ...`.
2. Set each copy's random pointer: `A'.random = A.random.next` (since `A.random`'s copy sits immediately after `A.random`).
3. Unweave: separate the interleaved list back into the original list and the pure copy list by fixing `next` pointers.
**Complexity.** Time `O(n)`, Space `O(1)` (excluding the output list itself).
```java
class Solution {
    public Node copyRandomList(Node head) {
        if (head == null) return null;

        // Step 1: interleave copies
        Node curr = head;
        while (curr != null) {
            Node copy = new Node(curr.val);
            copy.next = curr.next;
            curr.next = copy;
            curr = copy.next;
        }

        // Step 2: assign random pointers on copies
        curr = head;
        while (curr != null) {
            if (curr.random != null) {
                curr.next.random = curr.random.next;
            }
            curr = curr.next.next;
        }

        // Step 3: unweave into two lists
        Node dummy = new Node(0);
        Node copyTail = dummy;
        curr = head;
        while (curr != null) {
            Node copy = curr.next;
            curr.next = copy.next; // restore original list
            copyTail.next = copy;
            copyTail = copy;
            curr = curr.next;
        }
        return dummy.next;
    }
}
```

## Key Takeaways
- The interleave trick works because a copy node's random target is always `original.random.next` — the copy is guaranteed to sit right after its original.
- Always restore the original list's `next` pointers during unweaving; forgetting this corrupts the input, which some graders check.
- HashMap approach is simpler to write correctly under interview pressure; mention the O(1)-space trick as the follow-up optimization.
- Related: Clone Graph (same "map original to copy" idea generalized to a graph via BFS/DFS).
