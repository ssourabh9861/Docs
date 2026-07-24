# Sort List

**Difficulty:** Hard · **Pattern:** Bottom-up / top-down merge sort adapted to linked lists (fast/slow split + merge) · [LeetCode](https://leetcode.com/problems/sort-list/)

## Problem
Given the head of a linked list, sort it in ascending order and return the sorted list. The expected time complexity is `O(n log n)` with `O(1)` extra space as a follow-up.

## Examples
**Example 1**
```
Input:  head = [4,2,1,3]
Output: [1,2,3,4]
Explanation: Standard ascending sort of the list values.
```

**Example 2**
```
Input:  head = [-1,5,3,4,0]
Output: [-1,0,3,4,5]
Explanation: Handles negative values the same way.
```

## Constraints
- The number of nodes in the list is in the range `[0, 5 * 10^4]`.
- `-10^5 <= Node.val <= 10^5`

## Approach 1 — Top-down merge sort (recursive)
**Idea.** Classic divide and conquer: find the middle with slow/fast pointers, split the list into two halves, recursively sort each half, then merge the two sorted halves. Simple and idiomatic, but recursion uses `O(log n)` stack space.
**Complexity.** Time `O(n log n)`, Space `O(log n)` recursion stack.
```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Solution {
    public ListNode sortList(ListNode head) {
        if (head == null || head.next == null) return head;

        // split into two halves
        ListNode slow = head, fast = head.next;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        ListNode secondHead = slow.next;
        slow.next = null;

        ListNode left = sortList(head);
        ListNode right = sortList(secondHead);
        return merge(left, right);
    }

    private ListNode merge(ListNode a, ListNode b) {
        ListNode dummy = new ListNode(0);
        ListNode tail = dummy;
        while (a != null && b != null) {
            if (a.val <= b.val) {
                tail.next = a;
                a = a.next;
            } else {
                tail.next = b;
                b = b.next;
            }
            tail = tail.next;
        }
        tail.next = (a != null) ? a : b;
        return dummy.next;
    }
}
```

## Approach 2 — Bottom-up merge sort (optimal, O(1) space)
**Idea.** Avoid recursion entirely by merging sublists of size `1, 2, 4, 8, ...` iteratively, doubling the merge width each pass, exactly like an iterative merge sort over an array but re-implemented with pointer surgery: split off a chunk of the current width, split off the next chunk, merge them, and re-attach to the growing sorted prefix.
**Complexity.** Time `O(n log n)`, Space `O(1)` (no recursion, only a fixed number of pointers).
```java
class Solution {
    public ListNode sortList(ListNode head) {
        if (head == null || head.next == null) return head;

        int n = 0;
        for (ListNode curr = head; curr != null; curr = curr.next) n++;

        ListNode dummy = new ListNode(0, head);
        for (int width = 1; width < n; width *= 2) {
            ListNode prev = dummy;
            ListNode curr = dummy.next;
            while (curr != null) {
                ListNode left = curr;
                ListNode right = split(left, width);
                curr = split(right, width); // remaining list after this pair of chunks
                prev = merge(left, right, prev);
            }
        }
        return dummy.next;
    }

    // detach and return the node 'width' steps after start, cutting start's list to length 'width'
    private ListNode split(ListNode start, int width) {
        if (start == null) return null;
        for (int i = 1; i < width && start.next != null; i++) {
            start = start.next;
        }
        ListNode rest = start.next;
        start.next = null;
        return rest;
    }

    // merge sorted lists a and b, attach result after 'prev', return new tail
    private ListNode merge(ListNode a, ListNode b, ListNode prev) {
        ListNode curr = prev;
        while (a != null && b != null) {
            if (a.val <= b.val) {
                curr.next = a;
                a = a.next;
            } else {
                curr.next = b;
                b = b.next;
            }
            curr = curr.next;
        }
        curr.next = (a != null) ? a : b;
        while (curr.next != null) curr = curr.next;
        return curr;
    }
}
```

## Key Takeaways
- Merge sort is the natural fit for linked lists (unlike quicksort) because merging requires only pointer relinking, no random access or extra array.
- Top-down recursion is easier to write correctly; bottom-up iterative is the true `O(1)`-space answer and worth practicing since interviewers may explicitly ask for the follow-up.
- The `split(start, width)` helper both truncates the current chunk and returns the remainder — get this pointer surgery exactly right or chunks silently merge incorrectly.
- Related: Merge Two Sorted Lists, Merge k Sorted Lists, Insertion Sort List.
