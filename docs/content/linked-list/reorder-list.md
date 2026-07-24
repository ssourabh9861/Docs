# Reorder List

**Difficulty:** Medium · **Pattern:** Fast/slow pointer split + in-place reversal + merge · [LeetCode](https://leetcode.com/problems/reorder-list/)

## Problem
Given the head of a singly linked list `L0 -> L1 -> ... -> Ln-1 -> Ln`, reorder it in place to `L0 -> Ln -> L1 -> Ln-1 -> L2 -> Ln-2 -> ...`. You must do this without modifying the node values, only rearranging links.

## Examples
**Example 1**
```
Input:  head = [1,2,3,4]
Output: [1,4,2,3]
Explanation: Interleave first half [1,2] with reversed second half [4,3].
```

**Example 2**
```
Input:  head = [1,2,3,4,5]
Output: [1,5,2,4,3]
Explanation: First half [1,2,3], reversed second half [5,4]; interleaved with the extra middle element 3 left at the end.
```

## Constraints
- The number of nodes in the list is in the range `[1, 5 * 10^4]`.
- `1 <= Node.val <= 1000`

## Approach 1 — Split + reverse + merge (optimal, O(1) space)
**Idea.** Three steps: (1) find the middle using slow/fast pointers, splitting the list into two halves; (2) reverse the second half in place; (3) merge the two halves by alternating nodes from each.
**Complexity.** Time `O(n)`, Space `O(1)`.
```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Solution {
    public void reorderList(ListNode head) {
        if (head == null || head.next == null) return;

        // Step 1: find middle (slow ends at start of second half's boundary)
        ListNode slow = head, fast = head;
        while (fast.next != null && fast.next.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }

        // Step 2: reverse second half
        ListNode secondHead = slow.next;
        slow.next = null; // split the list into two halves
        ListNode prev = null, curr = secondHead;
        while (curr != null) {
            ListNode next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }
        ListNode second = prev; // head of reversed second half

        // Step 3: merge two halves, alternating
        ListNode first = head;
        while (second != null) {
            ListNode firstNext = first.next;
            ListNode secondNext = second.next;
            first.next = second;
            second.next = firstNext;
            first = firstNext;
            second = secondNext;
        }
    }
}
```

## Approach 2 — Array/deque of node references
**Idea.** Traverse the list once, storing every node reference in an `ArrayList`. Then use two pointers, `lo = 0` and `hi = size - 1`, walking inward and relinking `next` pointers alternately from the front and back until they meet. Simpler to write correctly but uses `O(n)` extra space.
**Complexity.** Time `O(n)`, Space `O(n)`.
```java
class Solution {
    public void reorderList(ListNode head) {
        if (head == null || head.next == null) return;

        List<ListNode> nodes = new ArrayList<>();
        for (ListNode curr = head; curr != null; curr = curr.next) {
            nodes.add(curr);
        }

        int lo = 0, hi = nodes.size() - 1;
        while (lo < hi) {
            nodes.get(lo).next = nodes.get(hi);
            lo++;
            if (lo == hi) break;
            nodes.get(hi).next = nodes.get(lo);
            hi--;
        }
        nodes.get(lo).next = null; // terminate the list
    }
}
```

## Key Takeaways
- This problem composes three fundamental linked-list primitives — find middle, reverse a list, merge two lists — a pattern worth memorizing standalone.
- Always terminate the final merged list with `null`; forgetting this leaves a cycle when the halves are unequal length.
- When splitting via slow/fast, `slow` lands on the last node of the first half (for even/odd length lists alike) — verify with a small trace before coding under pressure.
- Related: Palindrome Linked List (same split+reverse idea), Middle of the Linked List, Reverse Linked List.
