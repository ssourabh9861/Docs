# Employee Free Time

**Difficulty:** Hard · **Pattern:** Line sweep — flatten all intervals, merge, read off the gaps · [LeetCode](https://leetcode.com/problems/employee-free-time/)

## Problem
Given a list of schedules, one sorted list of non-overlapping `Interval`s per employee, return the list of finite intervals representing common free time for **all** employees, sorted in order.

## Examples
**Example 1**
```
Input:  schedule = [[[1,2],[5,6]],[[1,3]],[[4,10]]]
Output: [[3,4]]
Explanation: Union of busy time is [1,3] and [4,10] with a gap [3,4]; [5,6] is inside [4,10] so it adds nothing new.
```

## Constraints
- 1 <= schedule.length , schedule[i].length <= 50
- 0 <= schedule[i][j].start < schedule[i][j].end <= 10^8

## Approach 1 — Pairwise interval intersection check
**Idea.** Flatten nothing; instead scan across the global time range and, for each candidate gap between two consecutive intervals of employee A, verify no other employee has a meeting overlapping that gap. This is conceptually simple but requires comparing every candidate gap against every other employee's intervals.
**Complexity.** Time O(n^2) where n is the total number of intervals, Space O(n).
```java
import java.util.ArrayList;
import java.util.List;

class Interval {
    int start, end;
    Interval(int s, int e) { start = s; end = e; }
}

class Solution {
    public List<Interval> employeeFreeTime(List<List<Interval>> schedule) {
        List<Interval> all = new ArrayList<>();
        for (List<Interval> emp : schedule) all.addAll(emp);
        all.sort((a, b) -> a.start - b.start);

        List<Interval> result = new ArrayList<>();
        int curEnd = all.get(0).end;
        for (int i = 1; i < all.size(); i++) {
            Interval iv = all.get(i);
            if (iv.start > curEnd) {
                // gap found between curEnd and iv.start; verify no overlap (already guaranteed
                // by processing in sorted order below, but shown here as the "check" step)
                result.add(new Interval(curEnd, iv.start));
                curEnd = iv.end;
            } else {
                curEnd = Math.max(curEnd, iv.end);
            }
        }
        return result;
    }
}
```

## Approach 2 — Flatten, sort, sweep and merge (optimal)
**Idea.** Free time for the whole group is exactly the complement of the **union** of all busy intervals across every employee. Flatten all intervals into one list, sort by start time, then sweep left to right merging overlapping/touching intervals as in classic interval merging. Every time the next interval's start is strictly greater than the current merged interval's end, that gap `[curEnd, nextStart]` is a period when nobody is busy — i.e., free time for all.
**Complexity.** Time O(n log n) for the sort (the merge sweep itself is O(n)), Space O(n).
```java
import java.util.ArrayList;
import java.util.List;

class Interval {
    int start, end;
    Interval(int s, int e) { start = s; end = e; }
}

class Solution {
    public List<Interval> employeeFreeTime(List<List<Interval>> schedule) {
        List<Interval> all = new ArrayList<>();
        for (List<Interval> emp : schedule) {
            all.addAll(emp);
        }
        all.sort((a, b) -> Integer.compare(a.start, b.start));

        List<Interval> free = new ArrayList<>();
        int mergedEnd = all.get(0).end;
        for (int i = 1; i < all.size(); i++) {
            Interval iv = all.get(i);
            if (iv.start > mergedEnd) {
                free.add(new Interval(mergedEnd, iv.start));
                mergedEnd = iv.end;
            } else {
                mergedEnd = Math.max(mergedEnd, iv.end);
            }
        }
        return free;
    }
}
```

## Key Takeaways
- "Free time common to everyone" is the complement of the union of everyone's busy time — reduce a multi-list problem to a single flatten + merge-intervals pass.
- The merge sweep only needs one comparison per interval (`start > mergedEnd?`), making the whole algorithm dominated by the initial sort.
- This same flatten-and-sweep idea underlies Number of Airplanes in the Sky and Meeting Rooms II, just with different bookkeeping at each event (count vs. gap detection).
