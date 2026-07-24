# Course Schedule III

**Difficulty:** Hard · **Pattern:** interval end-time greedy with a max-heap swap · [LeetCode](https://leetcode.com/problems/course-schedule-iii/)

## Problem
Given `courses[i] = [duration, lastDay]`, where you can only take one course at a time and course `i` must be fully finished by `lastDay`, return the maximum number of courses you can take.

## Examples
**Example 1**
```
Input:  courses = [[100,200],[200,1300],[1000,1250],[2000,3200]]
Output: 3
Explanation: Take course 0 (finish day 100), course 1 (finish day 300), course 3 (finish day 2300). Course 2 doesn't fit.
```

**Example 2**
```
Input:  courses = [[1,2]]
Output: 1
Explanation: Take the single course; it finishes by day 1, within its deadline of 2.
```

## Constraints
- `1 <= courses.length <= 10^4`
- `1 <= duration_i <= 10^4`
- `1 <= lastDay_i <= 10^4`

## Approach 1 — Sort by Deadline, Max-Heap Swap
**Idea.** Sort courses by `lastDay` ascending, so we always consider the most urgent deadline next. Greedily try to take every course, keeping a running `time` total and a max-heap of the durations taken so far. If adding the current course keeps `time <= lastDay`, take it and push its duration. If it would blow the deadline, check whether it's shorter than the longest course already taken (heap max): if so, swapping it in (remove the longest, add this shorter one) keeps the same course *count* but frees up time for future courses, and can never hurt since all courses taken so far still finish by their own (later-or-equal) deadlines — we only ever reduce total elapsed time. This exchange argument is the crux: among courses that fit by their own deadlines, always keep the smallest possible durations to leave maximal slack for the rest.
**Complexity.** Time O(n log n), Space O(n).
```java
class Solution {
    public int scheduleCourse(int[][] courses) {
        Arrays.sort(courses, (a, b) -> a[1] - b[1]);
        PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
        long time = 0;

        for (int[] course : courses) {
            int duration = course[0], lastDay = course[1];
            time += duration;
            maxHeap.offer(duration);
            if (time > lastDay) {
                time -= maxHeap.poll(); // drop the longest course taken so far
            }
        }
        return maxHeap.size();
    }
}
```

## Approach 2 — Explicit Swap Check (Equivalent, More Verbose)
**Idea.** Same sort-by-deadline order, but instead of always pushing then conditionally popping, explicitly decide before adding: if the course fits within the deadline given current `time`, take it outright; otherwise, only replace the heap's longest course if this new course is strictly shorter, since that's the only scenario where swapping can help. This spells out the same greedy logic more explicitly for clarity, at no asymptotic cost.
**Complexity.** Time O(n log n), Space O(n).
```java
class Solution {
    public int scheduleCourse(int[][] courses) {
        Arrays.sort(courses, (a, b) -> a[1] - b[1]);
        PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
        long time = 0;

        for (int[] course : courses) {
            int duration = course[0], lastDay = course[1];
            if (time + duration <= lastDay) {
                time += duration;
                maxHeap.offer(duration);
            } else if (!maxHeap.isEmpty() && maxHeap.peek() > duration) {
                time += duration - maxHeap.poll();
                maxHeap.offer(duration);
            }
        }
        return maxHeap.size();
    }
}
```

## Key Takeaways
- Sorting by deadline ensures each new course is evaluated against the tightest remaining constraint first, which is necessary for the swap argument to be valid.
- Greedy choice: when a course doesn't fit, only swap it in for the currently longest taken course, and only if it's shorter — this can never decrease the count and can only reduce total elapsed time, preserving all future feasibility.
- The max-heap makes "find and evict the longest course so far" an O(log n) operation, which is what makes the swap-based greedy efficient.
