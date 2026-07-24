# My Calendar II / III

**Difficulty:** Hard · **Pattern:** sweep-line with +1/-1 events via TreeMap for overlap counting · [LeetCode](https://leetcode.com/problems/my-calendar-ii/)

## Problem
My Calendar II: support `book(start, end)` for a half-open event, returning `false` (and not booking) if adding it would cause a **triple** booking (three events overlapping at some point); otherwise book it and return `true`. My Calendar III: support `book(start, end)` where every call succeeds, returning the maximum number of overlapping events (the "k-booking" count) after adding this event.

## Examples
**Example 1 (Calendar II)**
```
Input:
["MyCalendarTwo","book","book","book","book","book","book"]
[[],[10,20],[50,60],[10,40],[5,15],[5,10],[25,55]]
Output:
[null,true,true,true,false,true,true]
Explanation: [10,20]+[50,60]+[10,40] causes a double overlap [10,20] (allowed). [5,15] would triple-overlap [10,15] with the existing two -> false. [5,10] touches, fine. [25,55] only double-overlaps -> true.
```

**Example 2 (Calendar III)**
```
Input:
["MyCalendarThree","book","book","book"]
[[],[10,20],[50,60],[10,40]]
Output:
[null,1,1,2]
Explanation: After booking [10,40] alongside [10,20], the max concurrent overlap becomes 2.
```

## Constraints
- 0 <= start < end <= 10^9
- At most 400 calls to book (Calendar II) / 400 calls to book (Calendar III).

## Approach 1 — My Calendar II: track overlaps list, reject on triple
**Idea.** Maintain a list of booked intervals and a separate list of "double-booked" (overlap) intervals. To book a new event, first check it doesn't overlap any existing double-booked interval (that would make a triple); if safe, compute its overlap with every existing single-booked interval and add those overlaps to the double-booked list, then add the event itself to the booked list.
**Complexity.** Time O(n) per booking (n = events so far), Space O(n).
```java
class MyCalendarTwo {
    private final List<int[]> bookings = new ArrayList<>();
    private final List<int[]> overlaps = new ArrayList<>();

    public MyCalendarTwo() {}

    public boolean book(int start, int end) {
        for (int[] ov : overlaps) {
            if (start < ov[1] && ov[0] < end) {
                return false; // would create a triple booking
            }
        }
        for (int[] b : bookings) {
            int overlapStart = Math.max(start, b[0]);
            int overlapEnd = Math.min(end, b[1]);
            if (overlapStart < overlapEnd) {
                overlaps.add(new int[]{overlapStart, overlapEnd});
            }
        }
        bookings.add(new int[]{start, end});
        return true;
    }
}
```

## Approach 2 — My Calendar III: TreeMap sweep-line delta counting (optimal, generalizes to k-bookings)
**Idea.** Use a `TreeMap<Integer, Integer>` as a difference array over event boundaries: on `book(start, end)`, increment the count at `start` by 1 and decrement at `end` by 1. Then sweep the map in sorted key order, maintaining a running sum; the maximum running sum ever seen is the max overlap ("k") after this booking. Since My Calendar II is just "reject if k would exceed 2," the same TreeMap technique subsumes both problems — for Calendar II you can simulate the booking, compute max overlap, and roll back if it exceeds 2.
**Complexity.** Time O(n log n) per call (TreeMap insert + full sweep of up to n entries), Space O(n).
```java
class MyCalendarThree {
    private final TreeMap<Integer, Integer> delta = new TreeMap<>();

    public MyCalendarThree() {}

    public int book(int start, int end) {
        delta.merge(start, 1, Integer::sum);
        delta.merge(end, -1, Integer::sum);

        int running = 0, maxOverlap = 0;
        for (int change : delta.values()) {
            running += change;
            maxOverlap = Math.max(maxOverlap, running);
        }
        return maxOverlap;
    }
}

// My Calendar II re-implemented with the same sweep-line trick,
// booking speculatively and rolling back if it would triple-book.
class MyCalendarTwo {
    private final TreeMap<Integer, Integer> delta = new TreeMap<>();

    public MyCalendarTwo() {}

    public boolean book(int start, int end) {
        delta.merge(start, 1, Integer::sum);
        delta.merge(end, -1, Integer::sum);

        int running = 0, maxOverlap = 0;
        for (int change : delta.values()) {
            running += change;
            maxOverlap = Math.max(maxOverlap, running);
        }

        if (maxOverlap >= 3) {
            // roll back
            delta.merge(start, -1, Integer::sum);
            delta.merge(end, 1, Integer::sum);
            if (delta.get(start) == 0) delta.remove(start);
            if (delta.get(end) == 0) delta.remove(end);
            return false;
        }
        return true;
    }
}
```

## Key Takeaways
- My Calendar III is the general "max k overlapping intervals" sweep-line: +1 at start, -1 at end, sweep sorted keys, track running max — same skeleton as Meeting Rooms II.
- My Calendar II can be solved either by explicitly tracking pairwise overlaps (simple, O(n) per call, no rollback needed) or by reusing the III sweep-line with speculative booking + rollback, showing the two problems share one underlying technique.
- A `TreeMap` keyed by event boundary naturally keeps the sweep sorted as bookings arrive online, avoiding a full re-sort on every call.
