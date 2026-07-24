# Merge k Sorted Lists

**Difficulty:** Hard · **Pattern:** Divide-and-conquer merge / min-heap over list heads · [LeetCode](https://leetcode.com/problems/merge-k-sorted-lists/)

## Problem
You are given an array of `k` linked lists, each sorted in ascending order. Merge all the linked lists into one sorted linked list and return it.

## Examples
**Example 1**
```
Input:  lists = [[1,4,5],[1,3,4],[2,6]]
Output: [1,1,2,3,4,4,5,6]
Explanation: Merging the three lists produces one fully sorted list.
```

**Example 2**
```
Input:  lists = []
Output: []
Explanation: No lists to merge, result is empty.
```

## Constraints
- `k == lists.length`
- `0 <= k <= 10^4`
- `0 <= lists[i].length <= 500`
- `-10^4 <= lists[i][j] <= 10^4`
- `lists[i]` is sorted in ascending order.
- The sum of `lists[i].length` will not exceed `10^4`.

## Approach 1 — Min-heap (priority queue)
**Idea.** Push the head of every non-null list into a min-heap keyed by value. Repeatedly pop the smallest node, append it to the result, and if it has a `next`, push that into the heap. This is essentially an k-way merge.
**Complexity.** Time `O(n log k)` where `n` is total nodes and `k` is the number of lists, Space `O(k)` for the heap.
```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        if (lists == null || lists.length == 0) return null;

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

## Approach 2 — Divide and conquer merge (optimal)
**Idea.** Pair up lists and merge them two at a time (reusing the standard "merge two sorted lists" routine), halving the number of lists each round, like the merge step of merge sort. This avoids the heap's per-op overhead and has the same asymptotic complexity but better constants and cache behavior.
**Complexity.** Time `O(n log k)`, Space `O(log k)` recursion stack (or `O(1)` iterative pairing).
```java
class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        if (lists == null || lists.length == 0) return null;
        return mergeRange(lists, 0, lists.length - 1);
    }

    private ListNode mergeRange(ListNode[] lists, int lo, int hi) {
        if (lo == hi) return lists[lo];
        if (lo > hi) return null;
        int mid = lo + (hi - lo) / 2;
        ListNode left = mergeRange(lists, lo, mid);
        ListNode right = mergeRange(lists, mid + 1, hi);
        return mergeTwo(left, right);
    }

    private ListNode mergeTwo(ListNode a, ListNode b) {
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

## Key Takeaways
- A naive sequential merge (merge list 1 with 2, then result with 3, ...) is `O(n*k)`; both heap and divide-and-conquer bring it to `O(n log k)`.
- The heap approach generalizes well when `k` is huge and lists arrive as streams; divide-and-conquer is better when all lists are available upfront and constants matter.
- A dummy head + tail pointer pattern is the backbone of every "build a merged list" problem.
- Related: Merge Two Sorted Lists, Kth Smallest Element in a Sorted Matrix (same k-way merge idea).
