# Linked List Cycle II

**Difficulty:** Medium · **Pattern:** Floyd's cycle detection (tortoise and hare) + cycle-entry pointer math · [LeetCode](https://leetcode.com/problems/linked-list-cycle-ii/)

## Problem
Given the head of a linked list, return the node where the cycle begins if a cycle exists; otherwise return `null`. Do not modify the list, and solve without using extra memory if possible.

## Examples
**Example 1**
```
Input:  head = [3,2,0,-4], pos = 1
Output: Node at index 1 (value 2)
Explanation: The tail's next points back to the node at index 1, forming a cycle whose entry is that node.
```

**Example 2**
```
Input:  head = [1], pos = -1
Output: null
Explanation: No cycle exists.
```

## Constraints
- The number of nodes in the list is in the range `[0, 10^4]`.
- `-10^5 <= Node.val <= 10^5`
- `pos` is `-1` or a valid index representing where the tail connects to, used only to build the test case (not passed as a parameter).

## Approach 1 — HashSet of visited nodes
**Idea.** Walk the list, storing each visited node reference in a `HashSet`. The first node already present in the set is the cycle's entry point; if we reach `null`, there's no cycle.
**Complexity.** Time `O(n)`, Space `O(n)`.
```java
class ListNode {
    int val;
    ListNode next;
    ListNode(int x) {
        val = x;
        next = null;
    }
}

public class Solution {
    public ListNode detectCycle(ListNode head) {
        Set<ListNode> visited = new HashSet<>();
        ListNode curr = head;
        while (curr != null) {
            if (!visited.add(curr)) return curr; // add() returns false if already present
            curr = curr.next;
        }
        return null;
    }
}
```

## Approach 2 — Floyd's cycle detection (optimal, O(1) space)
**Idea.** Phase 1: move `slow` one step and `fast` two steps at a time; if they meet, a cycle exists. Phase 2: reset one pointer to `head`, keep the other at the meeting point, then advance both one step at a time — they meet exactly at the cycle's entry node. This works because the distance from `head` to the cycle entry equals the distance from the meeting point to the cycle entry (mod cycle length) — a direct consequence of the phase-1 meeting-point algebra.
**Complexity.** Time `O(n)`, Space `O(1)`.
```java
public class Solution {
    public ListNode detectCycle(ListNode head) {
        ListNode slow = head, fast = head;

        // Phase 1: detect whether a cycle exists
        boolean hasCycle = false;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) {
                hasCycle = true;
                break;
            }
        }
        if (!hasCycle) return null;

        // Phase 2: find the entry point
        ListNode ptr1 = head;
        ListNode ptr2 = slow; // meeting point
        while (ptr1 != ptr2) {
            ptr1 = ptr1.next;
            ptr2 = ptr2.next;
        }
        return ptr1;
    }
}
```

## Key Takeaways
- Let `a` = distance from head to cycle start, `b` = distance from cycle start to meeting point; the meeting-point math guarantees `a` also equals the remaining distance around the cycle back to the start from the meeting point — hence resetting one pointer to `head` and advancing both by 1 finds the entry.
- Always guard with `fast != null && fast.next != null` before advancing `fast` by two — this is the most common off-by-one bug in Floyd's algorithm.
- HashSet approach is a fine warm-up/fallback; Floyd's is the expected optimal answer and a must-memorize interview staple.
- Related: Linked List Cycle (detection only), Find the Duplicate Number (Floyd's applied to an implicit functional graph).
