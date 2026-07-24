# Merge Intervals / Insert Interval

**Difficulty:** Medium · **Pattern:** sort by start, merge while overlapping · [LeetCode](https://leetcode.com/problems/merge-intervals/)

## Problem
Given a collection of intervals, merge all overlapping intervals and return the resulting non-overlapping set. Insert Interval is the same idea specialized to inserting one new interval into an already-sorted, non-overlapping list.

## Examples
**Example 1**
```
Input:  intervals = [[1,3],[2,6],[8,10],[15,18]]
Output: [[1,6],[8,10],[15,18]]
Explanation: [1,3] and [2,6] overlap (2 <= 3), merge into [1,6].
```

**Example 2 (Insert Interval)**
```
Input:  intervals = [[1,3],[6,9]], newInterval = [2,5]
Output: [[1,5],[6,9]]
Explanation: [2,5] overlaps [1,3] only; merged with it, [6,9] stays separate.
```

## Constraints
- 1 <= intervals.length <= 10^4
- intervals[i].length == 2, 0 <= start <= end <= 10^5
- For Insert Interval, the input list is already sorted by start and non-overlapping.

## Approach 1 — Sort then linear merge
**Idea.** Sort intervals by start time. Walk through them keeping a "current" merged interval; if the next interval's start is <= current end, extend current's end to max(current.end, next.end); otherwise push current and start a new one. This works for the general Merge Intervals problem directly.
**Complexity.** Time O(n log n) for the sort, Space O(n) for the output.
```java
class Solution {
    public int[][] merge(int[][] intervals) {
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));
        List<int[]> merged = new ArrayList<>();
        int[] current = intervals[0].clone();
        for (int i = 1; i < intervals.length; i++) {
            int[] next = intervals[i];
            if (next[0] <= current[1]) {
                current[1] = Math.max(current[1], next[1]);
            } else {
                merged.add(current);
                current = next.clone();
            }
        }
        merged.add(current);
        return merged.toArray(new int[merged.size()][]);
    }
}
```

## Approach 2 — Single-pass insert (optimal for Insert Interval)
**Idea.** Since the input is already sorted and disjoint, avoid re-sorting. Walk once: copy all intervals ending strictly before newInterval starts, then absorb newInterval by expanding it over every interval that overlaps it, then copy the remaining intervals that start strictly after. Each interval is visited once.
**Complexity.** Time O(n), Space O(n) for the output.
```java
class Solution {
    public int[][] insert(int[][] intervals, int[] newInterval) {
        List<int[]> result = new ArrayList<>();
        int i = 0, n = intervals.length;

        // 1. intervals ending before newInterval starts
        while (i < n && intervals[i][1] < newInterval[0]) {
            result.add(intervals[i++]);
        }

        // 2. merge all overlapping intervals into newInterval
        int start = newInterval[0], end = newInterval[1];
        while (i < n && intervals[i][0] <= end) {
            start = Math.min(start, intervals[i][0]);
            end = Math.max(end, intervals[i][1]);
            i++;
        }
        result.add(new int[]{start, end});

        // 3. remaining intervals start after newInterval ends
        while (i < n) {
            result.add(intervals[i++]);
        }
        return result.toArray(new int[result.size()][]);
    }
}
```

## Key Takeaways
- Sorting by start is the universal first step for any interval-merging problem; overlap test is `next.start <= current.end`.
- When the array is already sorted (Insert Interval), a three-phase linear scan beats re-sorting — recognize when you can drop the O(n log n) factor.
- Always clone/copy arrays before mutating them into the result to avoid aliasing bugs with the input.
