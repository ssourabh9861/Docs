# Maximum Number of Events That Can Be Attended

**Difficulty:** Hard · **Pattern:** interval end-time greedy with a min-heap · [LeetCode](https://leetcode.com/problems/maximum-number-of-events-that-can-be-attended/)

## Problem
Given `events[i] = [startDay, endDay]`, where attending an event means being present on any single day within `[startDay, endDay]` and you can attend only one event per day, return the maximum number of events you can attend.

## Examples
**Example 1**
```
Input:  events = [[1,2],[2,3],[3,4]]
Output: 3
Explanation: Attend event 1 on day 1, event 2 on day 2, event 3 on day 3 (or 4).
```

**Example 2**
```
Input:  events = [[1,2],[2,3],[3,4],[1,2]]
Output: 4
Explanation: Attend day 1 for one [1,2] event, day 2 for the other [1,2]/[2,3] event, day 3 and day 4 for the rest.
```

## Constraints
- `1 <= events.length <= 10^5`
- `events[i].length == 2`
- `1 <= startDay_i <= endDay_i <= 10^5`

## Approach 1 — Min-Heap of End Days, Sweep by Day
**Idea.** Sort events by start day. Sweep through calendar days from the earliest start to the latest end. On each day, push into a min-heap every event whose start day has arrived. Then pop and discard any events from the heap whose end day has already passed (they're expired and unattendable). If the heap is non-empty, greedily attend the event with the *earliest* end day — it's the most urgent (least flexible for future days), so saving it for later risks losing it entirely, whereas events with later end days retain more options. This is the classic "always finish the most constrained task first" exchange argument: swapping in any other available event instead of the soonest-ending one can never help and might cause that event to expire unattended.
**Complexity.** Time O(n log n), Space O(n).
```java
class Solution {
    public int maxEvents(int[][] events) {
        Arrays.sort(events, (a, b) -> a[0] - b[0]);
        PriorityQueue<Integer> minHeap = new PriorityQueue<>(); // stores end days
        int n = events.length;
        int i = 0, attended = 0;
        int day = 1;

        while (i < n || !minHeap.isEmpty()) {
            // no events available yet and heap empty: jump straight to next event's start
            if (minHeap.isEmpty() && i < n) {
                day = Math.max(day, events[i][0]);
            }
            while (i < n && events[i][0] <= day) {
                minHeap.offer(events[i][1]);
                i++;
            }
            // discard expired events
            while (!minHeap.isEmpty() && minHeap.peek() < day) {
                minHeap.poll();
            }
            if (!minHeap.isEmpty()) {
                minHeap.poll(); // attend the event ending soonest
                attended++;
            }
            day++;
        }
        return attended;
    }
}
```

## Approach 2 — Sort by End Day, Greedy Earliest Available Day (Union-Find Style Baseline)
**Idea.** Sort events by end day instead. For each event in that order, greedily attend it on the earliest day within `[start, end]` that isn't already taken (a simple linear/union-find scan for "next free day"). Processing by end day first mirrors classic interval scheduling: committing the tightest-deadline event to its earliest free slot preserves the most flexibility for events with later deadlines. This is conceptually simpler but the naive "scan for a free day" is O(range) per event without a union-find/next-free-day structure, making it a useful but less efficient baseline compared to the sweep + min-heap.
**Complexity.** Time O(n log n + n * range) naive, or O(n α(n)) with union-find "next free day" path compression; Space O(n).
```java
class Solution {
    public int maxEvents(int[][] events) {
        Arrays.sort(events, (a, b) -> a[1] - b[1]); // sort by end day
        boolean[] dayTaken = new boolean[100002];
        int attended = 0;

        for (int[] event : events) {
            for (int day = event[0]; day <= event[1]; day++) {
                if (!dayTaken[day]) {
                    dayTaken[day] = true;
                    attended++;
                    break;
                }
            }
        }
        return attended;
    }
}
```

## Key Takeaways
- Greedy choice: among all currently available events, always attend the one with the earliest end day — it is the most time-critical and has the least room to be deferred.
- Sorting by start day and sweeping day-by-day with a min-heap of end days lets expired events be lazily discarded, keeping the heap's top always the true most-urgent valid choice.
- The end-day-sort baseline captures the same intuition (handle tightest deadlines first) but needs an efficient "next free day" structure (e.g., union-find) to match the sweep's O(n log n) performance.
