# Employee Free Time

**Difficulty:** Hard · **Pattern:** flatten + sort/merge, or k-way heap merge · [LeetCode](https://leetcode.com/problems/employee-free-time/)

## Problem
Given a list of schedules, one per employee, where each schedule is a list of non-overlapping intervals sorted by start time, return the list of finite intervals representing common free time for all employees, sorted by start time.

## Examples
**Example 1**
```
Input:  schedule = [[[1,2],[5,6]],[[1,3]],[[4,10]]]
Output: [[3,4]]
Explanation: Flattened busy intervals merge to [1,3],[4,10],[5,6]->merged [1,3],[4,10]; the only gap between merged busy blocks is [3,4].
```

**Example 2**
```
Input:  schedule = [[[1,3],[6,7]],[[2,4]],[[2,5],[9,12]]]
Output: [[5,6],[7,9]]
Explanation: Merged busy intervals: [1,5],[6,7],[9,12]. Gaps between them are [5,6] and [7,9].
```

## Constraints
- 1 <= schedule.length, schedule[i].length <= 50
- 0 <= schedule[i][j].start < schedule[i][j].end <= 10^8

## Approach 1 — Flatten, sort, merge, then find gaps
**Idea.** Collect every interval across all employees into one list, sort by start time, merge overlapping ones exactly like Merge Intervals, then scan consecutive merged intervals: the gap between one's end and the next's start (when end < next start) is a free-time interval.
**Complexity.** Time O(n log n) where n is total interval count across all employees, Space O(n).
```java
class Solution {
    public List<Interval> employeeFreeTime(List<List<Interval>> schedule) {
        List<Interval> all = new ArrayList<>();
        for (List<Interval> emp : schedule) {
            all.addAll(emp);
        }
        all.sort((a, b) -> Integer.compare(a.start, b.start));

        List<Interval> merged = new ArrayList<>();
        Interval current = all.get(0);
        for (int i = 1; i < all.size(); i++) {
            Interval next = all.get(i);
            if (next.start <= current.end) {
                current.end = Math.max(current.end, next.end);
            } else {
                merged.add(current);
                current = next;
            }
        }
        merged.add(current);

        List<Interval> result = new ArrayList<>();
        for (int i = 1; i < merged.size(); i++) {
            int gapStart = merged.get(i - 1).end;
            int gapEnd = merged.get(i).start;
            if (gapStart < gapEnd) {
                result.add(new Interval(gapStart, gapEnd));
            }
        }
        return result;
    }
}

// Definition provided by LeetCode:
class Interval {
    int start, end;
    Interval() {}
    Interval(int s, int e) { start = s; end = e; }
}
```

## Approach 2 — K-way heap merge across employees (optimal for many employees, few intervals each)
**Idea.** Instead of dumping all intervals into one array and sorting, use a min-heap keyed by start time holding one "current" interval per employee (plus that employee's index and position). Repeatedly pop the smallest, compare against a running `previousEnd`, emit a gap if there is one, then push that employee's next interval. This is the same idea as merging k sorted lists and is more natural when k (employees) is small relative to total intervals, or when schedules are streamed.
**Complexity.** Time O(n log k) where k is number of employees, n is total intervals, Space O(k) for the heap.
```java
class Solution {
    public List<Interval> employeeFreeTime(List<List<Interval>> schedule) {
        // heap entries: [start, employeeIndex, intervalIndex]
        PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
        for (int i = 0; i < schedule.size(); i++) {
            if (!schedule.get(i).isEmpty()) {
                heap.offer(new int[]{schedule.get(i).get(0).start, i, 0});
            }
        }

        List<Interval> result = new ArrayList<>();
        int previousEnd = -1;
        boolean first = true;

        while (!heap.isEmpty()) {
            int[] top = heap.poll();
            int emp = top[1], idx = top[2];
            Interval iv = schedule.get(emp).get(idx);

            if (!first && iv.start > previousEnd) {
                result.add(new Interval(previousEnd, iv.start));
            }
            first = false;
            previousEnd = Math.max(previousEnd, iv.end);

            if (idx + 1 < schedule.get(emp).size()) {
                heap.offer(new int[]{schedule.get(emp).get(idx + 1).start, emp, idx + 1});
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Employee Free Time reduces to Merge Intervals plus one extra pass: free time = gaps between consecutive merged busy blocks.
- Flatten-and-sort is simplest to reason about; a k-way heap merge is the same idea but avoids materializing and sorting the full flattened list, mirroring "Merge k Sorted Lists."
- Each employee's own schedule is already sorted, which is exactly the precondition k-way heap merge exploits.
