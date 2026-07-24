# Sliding Window Median

**Difficulty:** Hard · **Pattern:** two heaps + lazy deletion for a sliding window · [LeetCode](https://leetcode.com/problems/sliding-window-median/)

## Problem
Given an array `nums` and a window size `k`, return the median of each contiguous window of size `k` as it slides from left to right across the array.

## Examples
**Example 1**
```
Input:  nums = [1,3,-1,-3,5,3,6,7], k = 3
Output: [1.0,-1.0,-1.0,3.0,5.0,6.0]
Explanation: Window [1,3,-1] -> median 1; window [3,-1,-3] -> median -1; etc.
```

## Constraints
- 1 <= k <= nums.length <= 2000
- -2^31 <= nums[i] <= 2^31 - 1 (careful with int overflow when averaging)

## Approach 1 — Resort each window (brute force)
**Idea.** For each window, copy the k elements into a list, sort it, and read the median. Simple to reason about but re-sorts from scratch every slide.
**Complexity.** Time O(n * k log k), Space O(k).
```java
import java.util.*;

class Solution {
    public double[] medianSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        double[] result = new double[n - k + 1];
        for (int i = 0; i + k <= n; i++) {
            int[] window = Arrays.copyOfRange(nums, i, i + k);
            Arrays.sort(window);
            result[i] = (k % 2 == 1)
                ? window[k / 2]
                : ((long) window[k / 2 - 1] + window[k / 2]) / 2.0;
        }
        return result;
    }
}
```

## Approach 2 — Two heaps with lazy deletion (optimal)
**Idea.** Extend the "two heaps" median trick (max-heap `lo` for the smaller half, min-heap `hi` for the larger half) to a sliding window. Since heaps can't delete an arbitrary element in O(log k), use **lazy deletion**: track pending removals in a hash map, and whenever a heap's top is a number marked for removal, pop it and decrement its pending count before reading the true top. On each slide: add the incoming number to the correct heap (rebalance sizes), mark the outgoing number for lazy removal (rebalance sizes accounting for it), then clean the tops before recording the median.
**Complexity.** Time O(n log k) amortized, Space O(k).
```java
import java.util.*;

class Solution {
    public double[] medianSlidingWindow(int[] nums, int k) {
        // max-heap for lower half, min-heap for upper half
        PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder());
        PriorityQueue<Integer> hi = new PriorityQueue<>();
        Map<Integer, Integer> pendingRemoval = new HashMap<>();
        int loSize = 0, hiSize = 0;

        int n = nums.length;
        double[] result = new double[n - k + 1];

        // build the first window
        for (int i = 0; i < k; i++) {
            lo.offer(nums[i]);
        }
        for (int i = 0; i < k / 2; i++) {
            hi.offer(lo.poll());
        }
        loSize = k - k / 2;
        hiSize = k / 2;

        for (int i = k; ; i++) {
            result[i - k] = (loSize > hiSize) ? lo.peek() : ((long) lo.peek() + hi.peek()) / 2.0;
            if (i == n) break;

            int outNum = nums[i - k];
            int inNum = nums[i];

            // decide which side outNum logically belongs to, to keep size bookkeeping correct
            boolean outIsLo = outNum <= lo.peek();
            pendingRemoval.merge(outNum, 1, Integer::sum);
            if (outIsLo) loSize--; else hiSize--;

            // insert new number on the side matching outgoing element, keeping balance approach simple
            if (!hi.isEmpty() && inNum >= hi.peek()) {
                hi.offer(inNum);
                hiSize++;
            } else {
                lo.offer(inNum);
                loSize++;
            }

            // rebalance sizes
            if (loSize > hiSize + 1) {
                hi.offer(lo.poll());
                loSize--; hiSize++;
            } else if (hiSize > loSize) {
                lo.offer(hi.poll());
                hiSize--; loSize++;
            }

            // clean tops lazily
            while (!lo.isEmpty() && pendingRemoval.getOrDefault(lo.peek(), 0) > 0) {
                int v = lo.poll();
                pendingRemoval.merge(v, -1, Integer::sum);
            }
            while (!hi.isEmpty() && pendingRemoval.getOrDefault(hi.peek(), 0) > 0) {
                int v = hi.poll();
                pendingRemoval.merge(v, -1, Integer::sum);
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Lazy deletion is the key trick when a heap needs "remove this specific value" support: mark it, and only actually pop when it surfaces at the top.
- Always clean both heap tops *after* rebalancing, before reading the median, otherwise a stale (removed) value can be reported.
- Watch for `int` overflow when averaging two `int`s near `Integer.MAX_VALUE`/`MIN_VALUE` — cast to `long` before adding.
