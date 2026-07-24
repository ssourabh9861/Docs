# Task Scheduler

**Difficulty:** Medium · **Pattern:** max-heap / frequency-slot greedy · [LeetCode](https://leetcode.com/problems/task-scheduler/)

## Problem
Given an array of CPU `tasks` (each an uppercase letter) and a cooldown `n`, where the same task must be separated by at least `n` intervals (idle allowed), return the minimum total number of intervals needed to finish all tasks.

## Examples
**Example 1**
```
Input:  tasks = ["A","A","A","B","B","B"], n = 2
Output: 8
Explanation: A -> B -> idle -> A -> B -> idle -> A -> B.
```

**Example 2**
```
Input:  tasks = ["A","A","A","B","B","B"], n = 0
Output: 6
Explanation: No cooldown needed, tasks run back to back in any order.
```

## Constraints
- `1 <= tasks.length <= 10^4`
- `tasks[i]` is an uppercase English letter.
- `0 <= n <= 100`

## Approach 1 — Max-Heap Simulation
**Idea.** Always schedule the currently most-frequent remaining task next (greedy choice), because delaying the most frequent task only makes it harder to fit later without idling — running the highest-count task as early and often as possible spreads it out fastest and minimizes forced idle slots. Use a max-heap keyed by remaining count: pop up to `n+1` tasks per "round," decrement their counts, push back any with remaining count > 0, and count the round length as `n+1` unless tasks run out early (then count only what was used). This directly simulates the schedule.
**Complexity.** Time O(T log 26) where T = tasks.length (heap size bounded by 26 letters), Space O(26).
```java
class Solution {
    public int leastInterval(char[] tasks, int n) {
        int[] freq = new int[26];
        for (char c : tasks) freq[c - 'A']++;

        PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
        for (int f : freq) if (f > 0) maxHeap.offer(f);

        int time = 0;
        while (!maxHeap.isEmpty()) {
            List<Integer> leftover = new ArrayList<>();
            int slots = n + 1;
            int used = 0;
            while (used < slots && !maxHeap.isEmpty()) {
                int cnt = maxHeap.poll();
                if (cnt > 1) leftover.add(cnt - 1);
                used++;
                time++;
            }
            for (int c : leftover) maxHeap.offer(c);
            if (!maxHeap.isEmpty()) time += slots - used; // idle out the rest of this round
        }
        return time;
    }
}
```

## Approach 2 — Math Formula (Frequency Slot Counting)
**Idea.** Let `maxFreq` be the highest task count and `maxCount` the number of distinct tasks tied at that frequency. Build `maxFreq - 1` "chunks" of size `n + 1` (one slot reserved for the most frequent task plus `n` cooldown slots), then the last partial chunk holds `maxCount` tasks (all tasks tied for most frequent must each appear once in the final chunk). The greedy insight is that this arrangement is provably optimal: any schedule needs at least this many slots to separate the most frequent task, and all other tasks can always be slotted into the gaps without adding extra idle time. The answer is `max(tasks.length, (maxFreq - 1) * (n + 1) + maxCount)` — the raw task count matters when `n` is small enough that no idling is ever required.
**Complexity.** Time O(T), Space O(26).
```java
class Solution {
    public int leastInterval(char[] tasks, int n) {
        int[] freq = new int[26];
        for (char c : tasks) freq[c - 'A']++;

        int maxFreq = 0;
        for (int f : freq) maxFreq = Math.max(maxFreq, f);

        int maxCount = 0;
        for (int f : freq) if (f == maxFreq) maxCount++;

        int idleFilled = (maxFreq - 1) * (n + 1) + maxCount;
        return Math.max(tasks.length, idleFilled);
    }
}
```

## Key Takeaways
- Greedy choice: schedule the highest-remaining-frequency task first each round — it is the bottleneck resource, and deferring it never reduces the eventual idle cost.
- The heap simulation directly enforces the cooldown constraint per round; the math formula compresses that same reasoning into a closed-form bound derived from the most frequent task(s).
- The `max(tasks.length, ...)` guard handles the case where there are enough distinct tasks to fill all cooldown gaps, making idle time unnecessary.
