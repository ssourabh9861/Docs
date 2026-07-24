# Merge In Between Linked Lists

**Difficulty:** Medium · **Pattern:** Pointer splicing — locate boundary nodes then reattach · [LeetCode](https://leetcode.com/problems/merge-in-between-linked-lists/)

## Problem
Given two linked lists `list1` (length `n`) and `list2`, remove nodes from index `a` to index `b` (inclusive, 0-indexed) from `list1`, and insert the entirety of `list2` in their place, connecting the remaining ends of `list1` around it. Return the head of the resulting list.

## Examples
**Example 1**
```
Input:  list1 = [0,1,2,3,4,5], a = 3, b = 4, list2 = [1000000,1000001,1000002]
Output: [0,1,2,1000000,1000001,1000002,5]
Explanation: Nodes at indices 3 and 4 (values 3,4) are removed and replaced by all of list2.
```

**Example 2**
```
Input:  list1 = [0,1,2,3,4,5,6], a = 2, b = 5, list2 = [1000000,1000001,1000002,1000003,1000004]
Output: [0,1,1000000,1000001,1000002,1000003,1000004,6]
Explanation: Nodes at indices 2 through 5 are removed; list2 is fully spliced in between node 1 and node 6.
```

## Constraints
- `3 <= list1.length <= 10^4`
- `1 <= a <= b < list1.length - 1`
- `1 <= list2.length <= 10^4`

## Approach 1 — Locate boundary nodes then splice (optimal)
**Idea.** Walk `list1` to find `nodeBeforeA` (the node right before index `a`) and `nodeAfterB` (the node right after index `b`). Then find the tail of `list2`. Relink: `nodeBeforeA.next = list2` (head) and `list2Tail.next = nodeAfterB`. This discards the `[a, b]` segment of `list1` (garbage collected in Java) and requires no node value copying.
**Complexity.** Time `O(n + m)` where `n = list1.length`, `m = list2.length` (dominated by walking to index `a-1`, `b+1`, and to list2's tail), Space `O(1)`.
```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Solution {
    public ListNode mergeInBetween(ListNode list1, int a, int b, ListNode list2) {
        // find the node just before index a
        ListNode nodeBeforeA = list1;
        for (int i = 0; i < a - 1; i++) {
            nodeBeforeA = nodeBeforeA.next;
        }

        // find the node just after index b
        ListNode nodeAfterB = nodeBeforeA;
        for (int i = a - 1; i <= b; i++) {
            nodeAfterB = nodeAfterB.next;
        }

        // find the tail of list2
        ListNode list2Tail = list2;
        while (list2Tail.next != null) {
            list2Tail = list2Tail.next;
        }

        // splice list2 in between
        nodeBeforeA.next = list2;
        list2Tail.next = nodeAfterB;

        return list1;
    }
}
```

## Approach 2 — Single combined pass
**Idea.** Same core relinking, but compute `nodeBeforeA` and `nodeAfterB` in one traversal by counting steps as we go, then separately append `list2`. Functionally identical to Approach 1 but written as a single loop with an index counter — useful if you prefer explicit index tracking over two separate loops.
**Complexity.** Time `O(n + m)`, Space `O(1)`.
```java
class Solution {
    public ListNode mergeInBetween(ListNode list1, int a, int b, ListNode list2) {
        ListNode nodeBeforeA = null;
        ListNode nodeAfterB = list1;
        int index = 0;
        while (index <= b) {
            if (index == a - 1) nodeBeforeA = nodeAfterB;
            nodeAfterB = nodeAfterB.next;
            index++;
        }
        // nodeAfterB now sits at index b + 1

        ListNode list2Tail = list2;
        while (list2Tail.next != null) {
            list2Tail = list2Tail.next;
        }

        nodeBeforeA.next = list2;
        list2Tail.next = nodeAfterB;
        return list1;
    }
}
```

## Key Takeaways
- No node values need to be copied — this is purely a pointer-relinking exercise, which is faster and more idiomatic than rebuilding the list.
- Careful index bookkeeping matters: `nodeBeforeA` sits at index `a-1`, `nodeAfterB` at index `b+1`; off-by-one errors here are the main source of bugs.
- Since `a >= 1` is guaranteed by constraints, `nodeBeforeA` always exists — no need to handle `a == 0` via a dummy head.
- Related: Remove Nth Node From End of List, Reverse Linked List II (same "find boundary, splice" family of techniques).
