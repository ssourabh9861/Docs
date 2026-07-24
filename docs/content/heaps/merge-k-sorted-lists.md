# Merge k Sorted Lists

**Difficulty:** Hard · **Pattern:** k-way merge with a min-heap · [LeetCode](https://leetcode.com/problems/merge-k-sorted-lists/)

## Problem
Given an array of `k` linked lists, each sorted in ascending order, merge all of them into one sorted linked list and return its head.

## Examples
**Example 1**
```
Input:  lists = [[1,4,5],[1,3,4],[2,6]]
Output: [1,1,2,3,4,4,5,6]
Explanation: Merging all lists produces one fully sorted list.
```

## Constraints
- k == lists.length
- 0 <= k <= 10^4
- 0 <= lists[i].length <= 500
- -10^4 <= lists[i][j] <= 10^4
- lists[i] is sorted in ascending order
- The sum of lists[i].length will not exceed 10^4

## Approach 1 — Sequential pairwise merge
**Idea.** Merge lists two at a time (like merging two sorted arrays), folding the result into an accumulator. Correct but repeatedly re-scans merged data, so total work is O(k * N) where N is total nodes.
**Complexity.** Time O(k * N), Space O(1) extra (besides output).
```java
class ListNode {
    int val;
    ListNode next;
    ListNode(int val) { this.val = val; }
}

class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        ListNode result = null;
        for (ListNode list : lists) {
            result = mergeTwo(result, list);
        }
        return result;
    }

    private ListNode mergeTwo(ListNode a, ListNode b) {
        ListNode dummy = new ListNode(0);
        ListNode tail = dummy;
        while (a != null && b != null) {
            if (a.val <= b.val) { tail.next = a; a = a.next; }
            else { tail.next = b; b = b.next; }
            tail = tail.next;
        }
        tail.next = (a != null) ? a : b;
        return dummy.next;
    }
}
```

## Approach 2 — Min-heap k-way merge (optimal)
**Idea.** Push the head node of every non-empty list into a min-heap ordered by node value. Repeatedly poll the smallest node, append it to the output, and if that node has a `next`, push it back into the heap. This is the classic k-way merge — the heap always holds at most k candidates, so each of the N total nodes costs O(log k) to place.
**Complexity.** Time O(N log k), Space O(k) for the heap.
```java
import java.util.*;

class ListNode {
    int val;
    ListNode next;
    ListNode(int val) { this.val = val; }
}

class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        PriorityQueue<ListNode> heap = new PriorityQueue<>((a, b) -> a.val - b.val);
        for (ListNode node : lists) {
            if (node != null) heap.offer(node);
        }

        ListNode dummy = new ListNode(0);
        ListNode tail = dummy;
        while (!heap.isEmpty()) {
            ListNode smallest = heap.poll();
            tail.next = smallest;
            tail = tail.next;
            if (smallest.next != null) heap.offer(smallest.next);
        }
        return dummy.next;
    }
}
```

## Key Takeaways
- The heap size is bounded by k (number of lists), not N (total nodes) — that's the source of the log k speedup.
- Comparator compares node values, and the heap always holds "the current frontier" of each list — a template reusable for any k-way merge of sorted sequences.
- Alternative optimal approach: divide-and-conquer pairwise merging, also O(N log k), useful when a heap isn't desired.
