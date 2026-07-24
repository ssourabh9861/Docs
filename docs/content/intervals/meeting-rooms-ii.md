# Meeting Rooms II

**Difficulty:** Medium · **Pattern:** sweep-line with +1/-1 events (or min-heap of end times) · [LeetCode](https://leetcode.com/problems/meeting-rooms-ii/)

## Problem
Given an array of meeting time intervals, find the minimum number of conference rooms required so that no two overlapping meetings share a room.

## Examples
**Example 1**
```
Input:  intervals = [[0,30],[5,10],[15,20]]
Output: 2
Explanation: [0,30] overlaps both [5,10] and [15,20], but the latter two don't overlap each other, so 2 rooms suffice.
```

**Example 2**
```
Input:  intervals = [[7,10],[2,4]]
Output: 1
Explanation: The meetings don't overlap, so 1 room is enough.
```

## Constraints
- 1 <= intervals.length <= 10^4
- 0 <= start[i] < end[i] <= 10^6

## Approach 1 — Min-heap of active end times
**Idea.** Sort meetings by start time. Maintain a min-heap of end times for rooms currently in use. For each meeting, if the earliest-ending room's end time is <= the new meeting's start, that room frees up (pop it); then push the new meeting's end time. The heap size at any point is rooms in use, and its maximum size across the sweep is the answer.
**Complexity.** Time O(n log n), Space O(n) for the heap.
```java
class Solution {
    public int minMeetingRooms(int[][] intervals) {
        if (intervals.length == 0) return 0;
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));
        PriorityQueue<Integer> endTimes = new PriorityQueue<>();
        for (int[] m : intervals) {
            if (!endTimes.isEmpty() && endTimes.peek() <= m[0]) {
                endTimes.poll();
            }
            endTimes.offer(m[1]);
        }
        return endTimes.size();
    }
}
```

## Approach 2 — Sweep-line over separated start/end arrays (optimal)
**Idea.** Split starts and ends into two sorted arrays. Walk both with two pointers like a merge step: each time a meeting starts before (or exactly when, using `<` not `<=` for ends first) the earliest still-active meeting ends, room count increases; whenever an end is reached before the next start, room count decreases. Track the running max — that's the peak concurrency, i.e. rooms needed. This avoids the heap and its log factor for the room-count bookkeeping, though the sort still dominates.
**Complexity.** Time O(n log n), Space O(n) for the two arrays.
```java
class Solution {
    public int minMeetingRooms(int[][] intervals) {
        int n = intervals.length;
        if (n == 0) return 0;
        int[] starts = new int[n];
        int[] ends = new int[n];
        for (int i = 0; i < n; i++) {
            starts[i] = intervals[i][0];
            ends[i] = intervals[i][1];
        }
        Arrays.sort(starts);
        Arrays.sort(ends);

        int rooms = 0, maxRooms = 0;
        int s = 0, e = 0;
        while (s < n) {
            if (starts[s] < ends[e]) {
                rooms++;
                s++;
            } else {
                rooms--;
                e++;
            }
            maxRooms = Math.max(maxRooms, rooms);
        }
        return maxRooms;
    }
}
```

## Key Takeaways
- Room count is exactly the peak number of simultaneously active intervals — a classic sweep-line / concurrency-counting pattern, not just merging.
- A min-heap of end times naturally models "can I reuse a freed room?" — pop when the smallest end time is already <= the new start.
- Separating starts and ends into two sorted arrays and merge-walking them is an elegant heap-free variant of the same sweep.
