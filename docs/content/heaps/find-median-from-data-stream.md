# Find Median from Data Stream

**Difficulty:** Hard · **Pattern:** two heaps (max-heap lower half + min-heap upper half) · [LeetCode](https://leetcode.com/problems/find-median-from-data-stream/)

## Problem
Design a data structure that supports adding integers one at a time and, at any point, efficiently returning the median of all numbers seen so far.

## Examples
**Example 1**
```
Input:  addNum(1), addNum(2), findMedian(), addNum(3), findMedian()
Output: 1.5, 2.0
Explanation: After [1,2] median is (1+2)/2=1.5. After [1,2,3] median is 2.0.
```

## Constraints
- -10^5 <= num <= 10^5
- Up to 5 * 10^4 calls to addNum and findMedian combined
- findMedian may be called before addNum

## Approach 1 — Sorted list / insertion sort
**Idea.** Keep a sorted `ArrayList`. On `addNum`, binary-search the insertion point and insert (O(n) shift). `findMedian` reads the middle element(s) in O(1). Simple but insertion is linear, so it doesn't scale for large streams.
**Complexity.** Time O(n) per insert, O(1) per query. Space O(n).
```java
import java.util.*;

class MedianFinder {
    private final List<Integer> data = new ArrayList<>();

    public void addNum(int num) {
        int idx = Collections.binarySearch(data, num);
        if (idx < 0) idx = -idx - 1;
        data.add(idx, num);
    }

    public double findMedian() {
        int n = data.size();
        if (n % 2 == 1) return data.get(n / 2);
        return (data.get(n / 2 - 1) + data.get(n / 2)) / 2.0;
    }
}
```

## Approach 2 — Two heaps (optimal)
**Idea.** Maintain a max-heap `lo` holding the smaller half of numbers and a min-heap `hi` holding the larger half, kept balanced so `lo.size()` is either equal to `hi.size()` or one greater. Insert into `lo` first, then push `lo`'s max into `hi` to keep ordering correct, and rebalance if `hi` grows larger than `lo`. The median is `lo.peek()` (odd count) or the average of both tops (even count) — both O(1) to read.
**Complexity.** Time O(log n) per addNum, O(1) per findMedian. Space O(n).
```java
import java.util.*;

class MedianFinder {
    private final PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder()); // max-heap, smaller half
    private final PriorityQueue<Integer> hi = new PriorityQueue<>(); // min-heap, larger half

    public void addNum(int num) {
        lo.offer(num);
        hi.offer(lo.poll()); // move the largest of the lower half up
        if (hi.size() > lo.size()) {
            lo.offer(hi.poll()); // rebalance back
        }
    }

    public double findMedian() {
        if (lo.size() > hi.size()) return lo.peek();
        return (lo.peek() + hi.peek()) / 2.0;
    }
}
```

## Key Takeaways
- Two-heaps splits the stream at the median: max-heap for "left half", min-heap for "right half".
- Invariant: sizes differ by at most 1, and `lo` is never smaller than `hi`, so the median is always at the tops.
- This pattern generalizes directly to Sliding Window Median (add a removal step) and to any "running order-statistic" problem.
