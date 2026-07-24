# Meeting Rooms II

**Difficulty:** Medium · **Pattern:** Line sweep — sort start/end events, track running concurrency · [LeetCode](https://leetcode.com/problems/meeting-rooms-ii/)

## Problem
Given an array of meeting time intervals `intervals[i] = [starti, endi]`, return the minimum number of conference rooms required so that no two overlapping meetings share a room.

## Examples
**Example 1**
```
Input:  intervals = [[0,30],[5,10],[15,20]]
Output: 2
Explanation: [0,30] overlaps with both others, but [5,10] and [15,20] don't overlap each other, so 2 rooms suffice.
```
**Example 2**
```
Input:  intervals = [[7,10],[2,4]]
Output: 1
Explanation: The two meetings don't overlap, so 1 room is enough.
```

## Constraints
- 1 <= intervals.length <= 10^4
- 0 <= starti < endi <= 10^6

## Approach 1 — Min-heap of end times
**Idea.** Sort meetings by start time. Use a min-heap of currently-occupied rooms' end times. For each meeting, if the earliest-ending room finishes at or before the current start, reuse it (pop then push); otherwise open a new room (push without popping). The heap size at the end (its max size along the way) is the answer.
**Complexity.** Time O(n log n), Space O(n).
```java
import java.util.Arrays;
import java.util.PriorityQueue;

class Solution {
    public int minMeetingRooms(int[][] intervals) {
        if (intervals.length == 0) return 0;
        Arrays.sort(intervals, (a, b) -> a[0] - b[0]);

        PriorityQueue<Integer> endTimes = new PriorityQueue<>();
        for (int[] iv : intervals) {
            if (!endTimes.isEmpty() && endTimes.peek() <= iv[0]) {
                endTimes.poll(); // reuse the freed room
            }
            endTimes.offer(iv[1]);
        }
        return endTimes.size();
    }
}
```

## Approach 2 — Line sweep on start/end events (optimal, no heap)
**Idea.** A meeting starting contributes `+1` to concurrency, and one ending contributes `-1`. Sort all start times and all end times independently. Walk both sorted lists with two pointers: whichever event (start or end) has the smaller time happens first; on a tie, process the end **before** the start (a meeting ending at `t` frees a room before a new one starting at `t` needs it, since the interval is `[start, end)` in room-counting terms — LeetCode's constraint `starti < endi` and typical convention treats them as non-overlapping when equal). Track the running count and its maximum.
**Complexity.** Time O(n log n), Space O(n).
```java
import java.util.Arrays;

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
                rooms++;      // a meeting starts, needs a room
                s++;
            } else {
                rooms--;      // a room is freed before/at this start
                e++;
            }
            maxRooms = Math.max(maxRooms, rooms);
        }
        return maxRooms;
    }
}
```

## Key Takeaways
- Splitting intervals into independent start-events and end-events and sorting each is the essence of line sweep — you never need to reconstruct which end matches which start.
- On a tie (`start == end`), process the end first: a meeting freeing a room and another needing one at the exact same instant can share that room.
- The heap approach generalizes better to problems needing "which room" (assignment), while pure two-pointer sweep is faster and simpler when only the count matters.
