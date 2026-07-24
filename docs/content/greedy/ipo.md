# IPO

**Difficulty:** Hard · **Pattern:** dual max-heap greedy (affordable-by-capital, then pick richest profit) · [LeetCode](https://leetcode.com/problems/ipo/)

## Problem
You have initial capital `w` and can complete at most `k` distinct projects, project `i` requiring `capital[i]` to start and yielding `profits[i]` upon completion (profit is added to your capital). Choose up to `k` projects to maximize final capital.

## Examples
**Example 1**
```
Input:  k = 2, w = 0, profits = [1,2,3], capital = [0,1,1]
Output: 4
Explanation: With w=0, only project 0 (capital 0) is affordable; take it, profit 1, capital becomes 1.
Now projects 1 and 2 (capital 1) are affordable; take project 2 (profit 3). Final capital = 0+1+3 = 4.
```

**Example 2**
```
Input:  k = 3, w = 0, profits = [1,2,3], capital = [0,1,2]
Output: 6
Explanation: Take project 0 (capital 1), then project 1 (capital 3), then project 2 (capital 6).
```

## Constraints
- `1 <= k <= 10^5`
- `0 <= w <= 10^9`
- `n == profits.length == capital.length`
- `1 <= n <= 10^5`
- `0 <= profits[i] <= 10^4`
- `0 <= capital[i] <= 10^9`

## Approach 1 — Two Heaps: Min-Heap by Capital, Max-Heap by Profit
**Idea.** Sort (or heap-index) all projects by required capital into a min-heap so we can efficiently pull out "all projects affordable with current capital." At each of the `k` rounds: move every project whose `capital <= w` from the capital-min-heap into a profit-max-heap (they're all currently doable candidates); then greedily pick the one with the *highest* profit from that max-heap — among everything currently affordable, the highest-profit project is always at least as good a choice as any other, since taking it only increases capital, which can only unlock more (never fewer) future options. This greedy choice is safe because capital is monotonically non-decreasing and profits are non-negative, so no future opportunity is ever hurt by taking the current maximum.
**Complexity.** Time O(n log n) for building/populating heaps, Space O(n).
```java
class Solution {
    public int findMaximizedCapital(int k, int w, int[] profits, int[] capital) {
        int n = profits.length;
        // min-heap of [capital, profit], ordered by capital
        PriorityQueue<int[]> byCapital = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        for (int i = 0; i < n; i++) {
            byCapital.offer(new int[]{capital[i], profits[i]});
        }

        // max-heap of profit, among currently affordable projects
        PriorityQueue<Integer> byProfit = new PriorityQueue<>(Collections.reverseOrder());

        long capitalNow = w;
        for (int round = 0; round < k; round++) {
            while (!byCapital.isEmpty() && byCapital.peek()[0] <= capitalNow) {
                byProfit.offer(byCapital.poll()[1]);
            }
            if (byProfit.isEmpty()) break; // no affordable project left
            capitalNow += byProfit.poll();
        }
        return (int) capitalNow;
    }
}
```

## Approach 2 — Sort by Capital, Linear Pointer Sweep (Avoids Repeated Heap Rebuilding)
**Idea.** Pre-sort projects by capital requirement once. Maintain a pointer that advances through this sorted list, pushing each newly affordable project's profit into a max-heap as capital grows. This is essentially the same two-structure greedy as Approach 1, but makes explicit that the capital-side structure only needs a single sort (not a heap) since we only ever scan it forward, never re-insert.
**Complexity.** Time O(n log n), Space O(n).
```java
class Solution {
    public int findMaximizedCapital(int k, int w, int[] profits, int[] capital) {
        int n = profits.length;
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> capital[a] - capital[b]);

        PriorityQueue<Integer> byProfit = new PriorityQueue<>(Collections.reverseOrder());
        long capitalNow = w;
        int ptr = 0;

        for (int round = 0; round < k; round++) {
            while (ptr < n && capital[order[ptr]] <= capitalNow) {
                byProfit.offer(profits[order[ptr]]);
                ptr++;
            }
            if (byProfit.isEmpty()) break;
            capitalNow += byProfit.poll();
        }
        return (int) capitalNow;
    }
}
```

## Key Takeaways
- Greedy choice: among all currently affordable projects, always take the one with the maximum profit — since capital only grows (never shrinks) after completing a project, this choice never closes off an option that was previously open.
- Two data structures serve two different orderings simultaneously: one to efficiently query "what's affordable now" (sorted/min-heap by capital) and one to answer "what's best among those" (max-heap by profit).
- Capping at `k` rounds and breaking early when nothing is affordable handles the case where fewer than `k` projects can ever be completed.
