# Smallest Range Covering Elements from K Lists

**Difficulty:** Hard · **Pattern:** k-pointers-in-heap — min-heap tracks the current window's minimum, track running max · [LeetCode](https://leetcode.com/problems/smallest-range-covering-elements-from-k-lists/)

## Problem
Given `k` sorted lists of integers, find the smallest range `[a, b]` (inclusive) such that at least one element from each of the `k` lists falls within `[a, b]`.

## Examples
**Example 1**
```
Input:  nums = [[4,10,15,24,26],[0,9,12,20],[5,18,22,30]]
Output: [20,24]
Explanation: [20,24] contains 24 from list 1, 20 from list 2, 22 from list 3.
```

## Constraints
- k == nums.length
- 1 <= k <= 3500
- 1 <= nums[i].length <= 50
- -10^5 <= nums[i][j] <= 10^5
- nums[i] is sorted in ascending order

## Approach 1 — Merge all with list-id, sliding window
**Idea.** Flatten all (value, listId) pairs, sort by value, then slide a window over this merged sequence looking for the shortest window that contains at least one element from every one of the k list-ids (classic "smallest substring containing all k categories" pattern using a frequency map).
**Complexity.** Time O(N log N) where N is total elements, Space O(N).
```java
import java.util.*;

class Solution {
    public int[] smallestRange(List<List<Integer>> nums) {
        int k = nums.size();
        List<int[]> merged = new ArrayList<>(); // [value, listId]
        for (int i = 0; i < k; i++) {
            for (int v : nums.get(i)) merged.add(new int[]{v, i});
        }
        merged.sort((a, b) -> a[0] - b[0]);

        Map<Integer, Integer> countInWindow = new HashMap<>();
        int distinct = 0;
        int left = 0;
        int bestStart = merged.get(0)[0], bestEnd = merged.get(merged.size() - 1)[0];

        for (int right = 0; right < merged.size(); right++) {
            int listId = merged.get(right)[1];
            countInWindow.merge(listId, 1, Integer::sum);
            if (countInWindow.get(listId) == 1) distinct++;

            while (distinct == k) {
                int lo = merged.get(left)[0], hi = merged.get(right)[0];
                if (hi - lo < bestEnd - bestStart) {
                    bestStart = lo; bestEnd = hi;
                }
                int leftListId = merged.get(left)[1];
                countInWindow.merge(leftListId, -1, Integer::sum);
                if (countInWindow.get(leftListId) == 0) distinct--;
                left++;
            }
        }
        return new int[]{bestStart, bestEnd};
    }
}
```

## Approach 2 — Min-heap over k pointers, track running max (optimal)
**Idea.** Push the first element of each list into a min-heap (storing value, listId, index), and separately track `currentMax`, the largest value currently represented across all k pointers. At every step, the current window is `[heap.peek().value, currentMax]` — a valid candidate since every list has a representative in it. Pop the minimum, record the range if it's the best so far, then advance that list's pointer and push its next element (updating `currentMax` if it grows). Stop when any list is exhausted, since then no further valid window can be formed.
**Complexity.** Time O(N log k) where N is total elements, Space O(k).
```java
import java.util.*;

class Solution {
    public int[] smallestRange(List<List<Integer>> nums) {
        int k = nums.size();
        // heap entries: [value, listId, indexInList]
        PriorityQueue<int[]> heap = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));

        int currentMax = Integer.MIN_VALUE;
        for (int i = 0; i < k; i++) {
            int v = nums.get(i).get(0);
            heap.offer(new int[]{v, i, 0});
            currentMax = Math.max(currentMax, v);
        }

        int bestStart = 0, bestEnd = Integer.MAX_VALUE;

        while (true) {
            int[] curr = heap.poll();
            int minVal = curr[0], listId = curr[1], idx = curr[2];

            if (currentMax - minVal < bestEnd - bestStart) {
                bestStart = minVal;
                bestEnd = currentMax;
            }

            List<Integer> list = nums.get(listId);
            if (idx + 1 == list.size()) break; // this list is exhausted, no more valid windows

            int nextVal = list.get(idx + 1);
            heap.offer(new int[]{nextVal, listId, idx + 1});
            currentMax = Math.max(currentMax, nextVal);
        }
        return new int[]{bestStart, bestEnd};
    }
}
```

## Key Takeaways
- The heap always holds exactly one representative per list, so `[heap top, currentMax]` is always a valid "covers all k lists" range by construction — no need to track counts.
- Stop as soon as any list runs out: once one list can't advance, every future window would be missing that list's coverage, so no smaller (or any) valid range remains to find.
- Same k-pointers-in-heap skeleton as Find K Pairs with Smallest Sums and Merge k Sorted Lists — a heap over "current frontier across k sequences."
