# Single-Threaded CPU

**Difficulty:** Hard · **Pattern:** event simulation — sort by arrival, min-heap by (processing time, index) for the ready queue · [LeetCode](https://leetcode.com/problems/single-threaded-cpu/)

## Problem
Given `n` tasks each with an `enqueueTime` and `processingTime`, a single-threaded CPU processes tasks one at a time: it always picks the task with the shortest processing time among those currently available (enqueued and not yet started), breaking ties by the smallest original index, and never idles unless no task is available. Return the order in which tasks are processed.

## Examples
**Example 1**
```
Input:  tasks = [[1,2],[2,4],[3,2],[4,1]]
Output: [0,2,3,1]
Explanation: At t=1, only task0 available -> run it (2 units, ends t=3).
At t=3, tasks 1,2 available; task2 has shorter processing time -> run it (ends t=5).
At t=5, tasks 1,3 available; task3 shortest -> run it (ends t=6). Then task1.
```

## Constraints
- 1 <= tasks.length <= 10^5
- 1 <= enqueueTime[i], processingTime[i] <= 10^9

## Approach 1 — Brute-force scan for next task each step
**Idea.** Maintain current time and a "done" marker per task. At each step, scan all not-yet-run tasks whose enqueueTime <= currentTime, pick the one with smallest processingTime (tie by index), run it (advance time by its processingTime), and repeat. If none are available, jump current time forward to the next task's enqueueTime. Simple but rescans the full task list on every step.
**Complexity.** Time O(n^2), Space O(n).
```java
import java.util.*;

class Solution {
    public int[] getOrder(int[][] tasks) {
        int n = tasks.length;
        Integer[] idx = new Integer[n];
        for (int i = 0; i < n; i++) idx[i] = i;

        boolean[] done = new boolean[n];
        long time = 0;
        int[] result = new int[n];
        int filled = 0;

        while (filled < n) {
            int best = -1;
            for (int i = 0; i < n; i++) {
                if (done[i] || tasks[i][0] > time) continue;
                if (best == -1
                    || tasks[i][1] < tasks[best][1]
                    || (tasks[i][1] == tasks[best][1] && i < best)) {
                    best = i;
                }
            }
            if (best == -1) {
                // no task ready yet; jump to earliest future enqueue time
                long next = Long.MAX_VALUE;
                for (int i = 0; i < n; i++) {
                    if (!done[i]) next = Math.min(next, tasks[i][0]);
                }
                time = next;
                continue;
            }
            done[best] = true;
            time += tasks[best][1];
            result[filled++] = best;
        }
        return result;
    }
}
```

## Approach 2 — Sort by enqueue time + min-heap ready queue (optimal)
**Idea.** Sort task indices by `enqueueTime`. Simulate the clock: maintain a pointer into the sorted-by-enqueue list and a min-heap ordered by `(processingTime, originalIndex)` representing tasks that have arrived but not yet run. At each step, push into the heap every task whose `enqueueTime <= currentTime`. If the heap is empty (CPU would idle), fast-forward `currentTime` to the next task's `enqueueTime`. Otherwise pop the heap's top (shortest processing time, tie-broken by index), record it, and advance `currentTime` by its processing time.
**Complexity.** Time O(n log n), Space O(n).
```java
import java.util.*;

class Solution {
    public int[] getOrder(int[][] tasks) {
        int n = tasks.length;
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> tasks[a][0] != tasks[b][0]
            ? Long.compare(tasks[a][0], tasks[b][0])
            : Integer.compare(a, b));

        // min-heap by [processingTime, originalIndex]
        PriorityQueue<int[]> ready = new PriorityQueue<>((a, b) ->
            a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);

        int[] result = new int[n];
        int filled = 0;
        int ptr = 0;
        long time = 0;

        while (filled < n) {
            // enqueue all tasks that have arrived by current time
            while (ptr < n && tasks[order[ptr]][0] <= time) {
                int taskIdx = order[ptr];
                ready.offer(new int[]{tasks[taskIdx][1], taskIdx});
                ptr++;
            }

            if (ready.isEmpty()) {
                // CPU idles until the next task arrives
                time = tasks[order[ptr]][0];
                continue;
            }

            int[] curr = ready.poll();
            int taskIdx = curr[1];
            int processingTime = curr[0];
            time += processingTime; // advance clock by this task's processing time
            result[filled++] = taskIdx;
        }
        return result;
    }
}
```

## Key Takeaways
- This is discrete-event simulation: sort the "arrival" events once, then use a heap as the "currently eligible" priority queue that gets refilled as the clock advances.
- Always drain all newly-arrived tasks into the ready heap *before* checking if it's empty, otherwise a same-time arrival gets missed and the CPU idles incorrectly.
- The idle-jump step (advance time to the next task's enqueueTime when the ready heap is empty) is essential — without it the simulation stalls forever waiting for arrivals that haven't "happened" yet.
