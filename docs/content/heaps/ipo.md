# IPO

**Difficulty:** Hard · **Pattern:** greedy with two heaps — sort by capital requirement, max-heap by profit · [LeetCode](https://leetcode.com/problems/ipo/)

## Problem
You start with capital `w` and can complete at most `k` distinct projects. Project `i` requires capital `capital[i]` to start and yields `profits[i]` upon completion (added to your capital). Choose up to `k` projects to maximize your final capital.

## Examples
**Example 1**
```
Input:  k = 2, w = 0, profits = [1,2,3], capital = [0,1,1]
Output: 4
Explanation: Start with w=0, only project 0 is affordable, do it -> capital=1.
Now projects 1,2 (profit 2,3) are affordable; pick profit 3 -> capital=4.
```

## Constraints
- 1 <= k <= 10^5
- 0 <= w <= 10^9
- n == profits.length == capital.length
- 1 <= n <= 10^5
- 0 <= profits[i] <= 10^4
- 0 <= capital[i] <= 10^9

## Approach 1 — Brute force rescan
**Idea.** For each of the `k` rounds, linearly scan all not-yet-used projects to find the affordable one (capital[i] <= current w) with the highest profit, mark it used, and add its profit to `w`. Correct but rescans everything each round.
**Complexity.** Time O(k * n), Space O(n).
```java
class Solution {
    public int findMaximizedCapital(int k, int w, int[] profits, int[] capital) {
        int n = profits.length;
        boolean[] used = new boolean[n];

        for (int round = 0; round < k; round++) {
            int bestIdx = -1;
            for (int i = 0; i < n; i++) {
                if (!used[i] && capital[i] <= w) {
                    if (bestIdx == -1 || profits[i] > profits[bestIdx]) {
                        bestIdx = i;
                    }
                }
            }
            if (bestIdx == -1) break; // no affordable project left
            used[bestIdx] = true;
            w += profits[bestIdx];
        }
        return w;
    }
}
```

## Approach 2 — Two heaps: min-heap by capital, max-heap by profit (optimal)
**Idea.** Push all projects into a min-heap ordered by required capital. At each of the `k` rounds: pop every project whose capital requirement is now affordable (<= current `w`) out of the capital-heap and push it into a max-heap ordered by profit. Then pop the max-heap's top (the best affordable project) and add its profit to `w`. This way each project is examined exactly once across the whole run rather than every round.
**Complexity.** Time O(n log n + k log n), Space O(n).
```java
import java.util.*;

class Solution {
    public int findMaximizedCapital(int k, int w, int[] profits, int[] capital) {
        int n = profits.length;

        // min-heap by capital requirement
        PriorityQueue<int[]> byCapital = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
        for (int i = 0; i < n; i++) {
            byCapital.offer(new int[]{capital[i], profits[i]});
        }

        // max-heap by profit, among currently affordable projects
        PriorityQueue<Integer> byProfit = new PriorityQueue<>(Collections.reverseOrder());

        for (int round = 0; round < k; round++) {
            while (!byCapital.isEmpty() && byCapital.peek()[0] <= w) {
                byProfit.offer(byCapital.poll()[1]);
            }
            if (byProfit.isEmpty()) break; // nothing affordable, stop early
            w += byProfit.poll();
        }
        return w;
    }
}
```

## Key Takeaways
- The two-heap trick splits the problem into "what's affordable now" (min-heap gate on capital) and "what's the best choice among those" (max-heap on profit).
- Each project moves from the capital-heap to the profit-heap at most once, which is why total work is O((n + k) log n) instead of O(k * n).
- This dual-heap-with-a-gate structure reappears in "unlock as constraints are satisfied" scheduling problems — always sort/heap on the *gating* attribute first, then optimize on the *reward* attribute.
