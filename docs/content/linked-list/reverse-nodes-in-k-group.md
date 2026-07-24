# Reverse Nodes in k-Group

**Difficulty:** Hard · **Pattern:** In-place reversal in fixed-size groups with a dummy head · [LeetCode](https://leetcode.com/problems/reverse-nodes-in-k-group/)

## Problem
Given the head of a linked list, reverse the nodes of the list `k` at a time and return the modified list. If the number of nodes remaining is less than `k`, leave them as-is. You may not alter the node values, only the links.

## Examples
**Example 1**
```
Input:  head = [1,2,3,4,5], k = 2
Output: [2,1,4,3,5]
Explanation: Nodes are reversed in pairs; the last single node 5 is left alone.
```

**Example 2**
```
Input:  head = [1,2,3,4,5], k = 3
Output: [3,2,1,4,5]
Explanation: First group of 3 is reversed; remaining [4,5] has fewer than k nodes so it stays as-is.
```

## Constraints
- The number of nodes in the list is `n`.
- `1 <= k <= n <= 5000`
- `0 <= Node.val <= 1000`
- Follow-up: Can you solve it in `O(1)` extra memory space (in-place, not counting recursion stack)?

## Approach 1 — Recursive reversal
**Idea.** Check if there are at least `k` nodes ahead. If so, reverse the first `k` using the classic iterative pointer-flip, then recursively process the rest and attach the recursive result to the tail of the reversed group (which was the original head).
**Complexity.** Time `O(n)`, Space `O(n/k)` recursion stack.
```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Solution {
    public ListNode reverseKGroup(ListNode head, int k) {
        ListNode node = head;
        int count = 0;
        while (node != null && count < k) {
            node = node.next;
            count++;
        }
        if (count < k) return head; // fewer than k nodes left, leave as-is

        // reverse first k nodes
        ListNode prev = reverseKGroup(node, k); // node is the (k+1)-th node, the new "next" after this group
        ListNode curr = head;
        while (count-- > 0) {
            ListNode next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }
        return prev; // new head of this group
    }
}
```

## Approach 2 — Iterative with dummy head (optimal, O(1) space)
**Idea.** Use a dummy node before head. Maintain a `groupPrev` pointer to the node before the current group. For each group: verify `k` nodes exist, reverse them in place using the standard three-pointer technique, then reconnect `groupPrev.next` to the new group head and the old group head's `next` to the following group. Advance `groupPrev` to the old group head (now the tail of the reversed group).
**Complexity.** Time `O(n)`, Space `O(1)`.
```java
class Solution {
    public ListNode reverseKGroup(ListNode head, int k) {
        ListNode dummy = new ListNode(0, head);
        ListNode groupPrev = dummy;

        while (true) {
            ListNode kth = getKth(groupPrev, k);
            if (kth == null) break;
            ListNode groupNext = kth.next;

            // reverse group: [groupPrev.next ... kth]
            ListNode prev = groupNext;
            ListNode curr = groupPrev.next;
            while (curr != groupNext) {
                ListNode tmp = curr.next;
                curr.next = prev;
                prev = curr;
                curr = tmp;
            }

            ListNode tail = groupPrev.next; // old head, now tail of reversed group
            groupPrev.next = kth;           // link previous group to new head
            groupPrev = tail;               // advance for next group
        }
        return dummy.next;
    }

    // returns the k-th node starting after start, or null if fewer than k nodes remain
    private ListNode getKth(ListNode start, int k) {
        ListNode curr = start;
        while (curr != null && k-- > 0) curr = curr.next;
        return curr;
    }
}
```

## Key Takeaways
- Always probe `k` nodes ahead first (`getKth`) before committing to reverse — this avoids partially reversing a tail group that has fewer than `k` nodes.
- A dummy head removes special-casing the very first group's reconnection.
- The reversed group's original head becomes its tail — save that pointer as the new `groupPrev` for the next iteration.
- Related: Reverse Linked List II (reverse a sub-range), Swap Nodes in Pairs (special case `k=2`).
