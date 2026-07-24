# My Calendar I / II / III

**Difficulty:** Hard · **Pattern:** Line sweep with a delta map (TreeMap) over interval endpoints · [LeetCode](https://leetcode.com/problems/my-calendar-i/)

## Problem
Design a calendar that supports booking `[start, end)` intervals (half-open) via repeated `book(start, end)` calls:
- **My Calendar I:** reject a booking if it would cause any **double booking** (two events overlapping at all); otherwise add it and return `true`/`false`.
- **My Calendar II:** allow double bookings but reject a booking if it would cause a **triple booking** (three events overlapping at the same point).
- **My Calendar III:** always accept every booking; `book(start, end)` returns the **maximum concurrency (k-booking)** achieved by any point in time so far.

All three are the same underlying question — "how many intervals cover this point" — at increasing levels of generality; III subsumes I and II.

## Examples
**Example 1 (Calendar I)**
```
book(10, 20) -> true
book(15, 25) -> false   // overlaps [10,20) at [15,20)
book(20, 30) -> true    // touches but doesn't overlap [10,20) since end is exclusive
```
**Example 2 (Calendar II)**
```
book(10, 20) -> true
book(50, 60) -> true
book(10, 40) -> true    // overlaps [10,20) -> double booking, still allowed
book(5, 15)  -> false   // would triple-book [10,15)
```
**Example 3 (Calendar III)**
```
book(10, 20) -> 1
book(50, 60) -> 1
book(10, 40) -> 2
book(5, 15)  -> 3
book(5, 10)  -> 3
```

## Constraints
- 0 <= start < end <= 10^9
- At most 1000 calls to `book` per instance.

## Approach 1 — Store intervals, scan on each booking
**Idea.** Keep a list of accepted (Calendar I) or all-events-so-far (Calendar II) intervals. For each new booking, check for overlap against the stored data: Calendar I rejects on any overlap with an existing booking; Calendar II additionally tracks a separate list of "overlap regions" between existing bookings and rejects if the new interval overlaps any of those (a triple booking). Calendar III can reuse Calendar II's overlap-counting idea generalized with a brute-force per-point scan, but that is best expressed via the sweep in Approach 2.
**Complexity.** Time O(n) per booking (O(n^2) total for n bookings), Space O(n).
```java
import java.util.ArrayList;
import java.util.List;

class MyCalendarI {
    private final List<int[]> booked = new ArrayList<>();

    public boolean book(int start, int end) {
        for (int[] b : booked) {
            if (start < b[1] && b[0] < end) return false; // overlap
        }
        booked.add(new int[]{start, end});
        return true;
    }
}

class MyCalendarII {
    private final List<int[]> booked = new ArrayList<>();
    private final List<int[]> overlaps = new ArrayList<>();

    public boolean book(int start, int end) {
        for (int[] ov : overlaps) {
            if (start < ov[1] && ov[0] < end) return false; // would triple-book
        }
        for (int[] b : booked) {
            int lo = Math.max(start, b[0]);
            int hi = Math.min(end, b[1]);
            if (lo < hi) overlaps.add(new int[]{lo, hi}); // record new double-booked region
        }
        booked.add(new int[]{start, end});
        return true;
    }
}
```

## Approach 2 — Delta line sweep with TreeMap (optimal, generalizes to III)
**Idea.** Model each booking as `+1` at `start` and `-1` at `end` on a timeline (a "difference array" over sparse coordinates). A `TreeMap<Integer, Integer>` stores only the timestamps where the concurrency changes. After inserting the delta for a new booking, walk the map in sorted key order accumulating a running sum — the maximum running sum across all keys is the current maximum concurrency. This single implementation directly solves **Calendar III**; **Calendar I** is the special case "reject if resulting max > 1," and **Calendar II** is "reject if resulting max > 2" (apply the delta, check, and roll it back if it would violate the limit).
**Complexity.** Time O(n log n) per booking (each call walks/updates a TreeMap of size O(n)), Space O(n).
```java
import java.util.TreeMap;

class MyCalendarThree {
    private final TreeMap<Integer, Integer> delta = new TreeMap<>();

    public int book(int start, int end) {
        delta.merge(start, 1, Integer::sum);
        delta.merge(end, -1, Integer::sum);

        int running = 0, max = 0;
        for (int change : delta.values()) {
            running += change;
            max = Math.max(max, running);
        }
        return max;
    }
}

// Calendar I and II expressed with the same delta-sweep idea, capping concurrency.
class MyCalendarCapped {
    private final TreeMap<Integer, Integer> delta = new TreeMap<>();
    private final int limit; // 1 for Calendar I, 2 for Calendar II

    MyCalendarCapped(int limit) {
        this.limit = limit;
    }

    public boolean book(int start, int end) {
        delta.merge(start, 1, Integer::sum);
        delta.merge(end, -1, Integer::sum);

        int running = 0, max = 0;
        for (int change : delta.values()) {
            running += change;
            max = Math.max(max, running);
        }
        if (max > limit) {
            // roll back: this booking is rejected
            delta.merge(start, -1, Integer::sum);
            delta.merge(end, 1, Integer::sum);
            return false;
        }
        return true;
    }
}
```

## Key Takeaways
- A `+1`/`-1` delta map at event coordinates converts "how many intervals cover point x" into a running prefix sum — the core line-sweep idiom reused across Meeting Rooms II, Calendar III, Number of Airplanes, and Describe the Painting.
- Calendar III subsumes I and II: computing the max concurrency after applying a delta and comparing it against a threshold (1 or 2) is enough to implement both simpler variants without separate overlap bookkeeping.
- Speculative apply-then-rollback (insert the delta, check the invariant, undo if violated) is a clean way to implement "reject if constraint broken" on top of a sweep structure that has no native undo.
