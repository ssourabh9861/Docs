# Task Scheduler

**Difficulty:** Medium · **Pattern:** greedy + max-heap scheduling by remaining frequency · [LeetCode](https://leetcode.com/problems/task-scheduler/)

## Problem
Given an array of tasks (letters) and a cooldown `n` (the same task must be separated by at least `n` intervals), return the minimum number of CPU intervals needed to finish all tasks, allowing idle slots.

## Examples
**Example 1**
```
Input:  tasks = ["A","A","A","B","B","B"], n = 2
Output: 8
Explanation: A -> B -> idle -> A -> B -> idle -> A -> B (8 intervals total).
```

## Constraints
- 1 <= tasks.length <= 10^4
- tasks[i] is an uppercase English letter
- 0 <= n <= 100

## Approach 1 — Max-heap simulation
**Idea.** Count frequency of each task. Repeatedly, in rounds of size `n + 1`, pull the most frequent remaining tasks from a max-heap (greedy: always schedule the task with the most remaining occurrences first, to spread out the "hardest" tasks). Decrement counts, push back non-exhausted tasks after the round, and count idle slots when the heap empties before the round is full.
**Complexity.** Time O(T log 26) where T is total intervals executed (heap has at most 26 entries), Space O(26).
```java
import java.util.*;

class Solution {
    public int leastInterval(char[] tasks, int n) {
        int[] freq = new int[26];
        for (char t : tasks) freq[t - 'A']++;

        PriorityQueue<Integer> heap = new PriorityQueue<>(Collections.reverseOrder());
        for (int f : freq) if (f > 0) heap.offer(f);

        int time = 0;
        while (!heap.isEmpty()) {
            List<Integer> leftover = new ArrayList<>();
            int slotsUsed = 0;
            // one "cooldown round" of length n + 1
            for (int i = 0; i <= n; i++) {
                if (!heap.isEmpty()) {
                    int count = heap.poll();
                    if (count > 1) leftover.add(count - 1);
                    slotsUsed++;
                }
                time++;
                if (heap.isEmpty() && leftover.isEmpty()) break; // done, no trailing idle needed
            }
            for (int c : leftover) heap.offer(c);
        }
        return time;
    }
}
```

## Approach 2 — Math formula (optimal, O(26))
**Idea.** The theoretical minimum time is governed by the most frequent task: if `maxFreq` is the highest count and `maxCount` is how many distinct tasks share that max frequency, arrange `maxFreq - 1` full "chunks" of length `n + 1` (task + cooldown fillers), plus a final partial chunk holding all `maxCount` tied tasks. This gives `(maxFreq - 1) * (n + 1) + maxCount`. If tasks are so plentiful there's no idle time needed, the answer is simply `tasks.length`. Take the max of the two.
**Complexity.** Time O(T) to count frequencies (T = tasks.length), Space O(26).
```java
class Solution {
    public int leastInterval(char[] tasks, int n) {
        int[] freq = new int[26];
        for (char t : tasks) freq[t - 'A']++;

        int maxFreq = 0;
        for (int f : freq) maxFreq = Math.max(maxFreq, f);

        int maxCount = 0;
        for (int f : freq) if (f == maxFreq) maxCount++;

        int scheduled = (maxFreq - 1) * (n + 1) + maxCount;
        return Math.max(tasks.length, scheduled);
    }
}
```

## Key Takeaways
- The heap simulation is the "obviously correct" greedy: always run the task with the most remaining work to avoid starving it later — mirrors interval/rate-limiting scheduling problems generally.
- The closed-form formula exploits the fact that only the *most frequent* task(s) can force idle slots; once frequencies are sufficiently spread out, tasks alone fill every slot and idle disappears — hence the `max(...)` with `tasks.length`.
- Recognize this pattern (max-heap greedy on remaining counts) reused in Reorganize String and Rearrange String k Distance Apart.
