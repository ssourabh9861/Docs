# Non-overlapping Intervals

**Difficulty:** Medium · **Pattern:** greedy, sort by end time · [LeetCode](https://leetcode.com/problems/non-overlapping-intervals/)

## Problem
Given an array of intervals, find the minimum number of intervals you need to remove so the rest are non-overlapping.

## Examples
**Example 1**
```
Input:  intervals = [[1,2],[2,3],[3,4],[1,3]]
Output: 1
Explanation: Remove [1,3] and the rest ([1,2],[2,3],[3,4]) don't overlap (touching endpoints are allowed).
```

**Example 2**
```
Input:  intervals = [[1,2],[1,2],[1,2]]
Output: 2
Explanation: Keep only one [1,2]; remove the other two duplicates.
```

## Constraints
- 1 <= intervals.length <= 10^5
- intervals[i].length == 2
- -5*10^4 <= start[i] < end[i] <= 5*10^4

## Approach 1 — Sort by start, greedily keep smaller end on conflict
**Idea.** Sort by start time. Track the end of the last kept interval. When the next interval starts before that end (overlap), you must remove one — remove whichever has the larger end, since keeping the smaller end leaves more room for future intervals. This is correct but slightly less standard than sorting by end directly.
**Complexity.** Time O(n log n), Space O(1) extra.
```java
class Solution {
    public int eraseOverlapIntervals(int[][] intervals) {
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));
        int removed = 0;
        int lastEnd = Integer.MIN_VALUE;
        for (int[] iv : intervals) {
            if (iv[0] >= lastEnd) {
                lastEnd = iv[1];
            } else {
                removed++;
                lastEnd = Math.min(lastEnd, iv[1]);
            }
        }
        return removed;
    }
}
```

## Approach 2 — Sort by end time, classic activity selection (optimal)
**Idea.** This is the activity-selection greedy: sort intervals by end time. Always keep an interval if its start is >= the end of the last kept interval — greedily picking the earliest-ending interval maximizes the number of non-overlapping intervals you can keep, which minimizes removals. Every interval that conflicts with the current end must be removed.
**Complexity.** Time O(n log n) for the sort, Space O(1) extra (ignoring sort's internal space).
```java
class Solution {
    public int eraseOverlapIntervals(int[][] intervals) {
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[1], b[1]));
        int kept = 1;
        int lastEnd = intervals[0][1];
        for (int i = 1; i < intervals.length; i++) {
            if (intervals[i][0] >= lastEnd) {
                kept++;
                lastEnd = intervals[i][1];
            }
        }
        return intervals.length - kept;
    }
}
```

## Key Takeaways
- Sorting by **end time** and greedily keeping the earliest-ending non-conflicting interval is the canonical activity-selection greedy — it maximizes the kept set, so removals = total - kept.
- Minimum removals to make a set non-overlapping is the complement of "maximum non-overlapping subset," a very common interval-DP-avoidance trick.
- Touching endpoints (`start == lastEnd`) count as non-overlapping — watch problem statements carefully for `>=` vs `>`.
