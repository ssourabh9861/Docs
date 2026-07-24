# Maximum Performance of a Team

**Difficulty:** Hard · **Pattern:** sort by one attribute + min-heap to cap the other (speed sum with min-efficiency multiplier) · [LeetCode](https://leetcode.com/problems/maximum-performance-of-a-team/)

## Problem
Given `n` engineers with `speed[i]` and `efficiency[i]`, and an integer `k`, choose at most `k` engineers to form a team maximizing performance, defined as (sum of chosen speeds) * (minimum efficiency among chosen). Return the result modulo 10^9 + 7.

## Examples
**Example 1**
```
Input:  n = 6, speed = [2,10,3,1,5,8], efficiency = [5,4,3,9,7,2], k = 2
Output: 60
Explanation: Choosing engineers 2 (speed=10, eff=4) and 5 (speed=5, eff=7):
performance = (5+10) * min(4,7) = 15*4 = 60.
```

## Constraints
- 1 <= n <= 10^5
- speed.length == efficiency.length == n
- 1 <= speed[i] <= 10^5
- 1 <= efficiency[i] <= 10^8
- 1 <= k <= n

## Approach 1 — Brute force over subsets by min-efficiency anchor
**Idea.** For every engineer treated as the "minimum efficiency" anchor, scan all other engineers with efficiency >= anchor's, greedily pick the top (k-1) speeds among them, and compute performance. Correct but requires repeated scanning/sorting per anchor.
**Complexity.** Time O(n^2 log n), Space O(n).
```java
import java.util.*;

class Solution {
    public int maxPerformance(int n, int[] speed, int[] efficiency, int k) {
        long best = 0;
        Integer[] idx = new Integer[n];
        for (int i = 0; i < n; i++) idx[i] = i;

        for (int anchor = 0; anchor < n; anchor++) {
            int minEff = efficiency[anchor];
            List<Integer> candidates = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                if (efficiency[i] >= minEff) candidates.add(speed[i]);
            }
            candidates.sort(Collections.reverseOrder());
            long speedSum = 0;
            for (int i = 0; i < Math.min(k, candidates.size()); i++) {
                speedSum += candidates.get(i);
            }
            best = Math.max(best, speedSum * minEff);
        }
        return (int) (best % 1_000_000_007);
    }
}
```

## Approach 2 — Sort by efficiency descending + min-heap of speeds (optimal)
**Idea.** Sort engineers by efficiency in descending order. Walk through them in that order, maintaining a running `speedSum` and a min-heap of the speeds currently included. Because we process efficiency descending, the current engineer's efficiency is always the minimum efficiency among everyone considered so far — so at each step, `speedSum * currentEfficiency` is a valid candidate performance. Add the current engineer's speed to the heap and sum; if the team size exceeds `k`, pop the smallest speed from the heap (evict the weakest link on speed) and subtract it from `speedSum`, keeping exactly at most `k` members.
**Complexity.** Time O(n log n) for sort + O(n log k) for heap ops, Space O(n).
```java
import java.util.*;

class Solution {
    public int maxPerformance(int n, int[] speed, int[] efficiency, int k) {
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> efficiency[b] - efficiency[a]); // descending efficiency

        PriorityQueue<Integer> speedHeap = new PriorityQueue<>(); // min-heap of chosen speeds
        long speedSum = 0;
        long best = 0;
        final int MOD = 1_000_000_007;

        for (int i : order) {
            speedHeap.offer(speed[i]);
            speedSum += speed[i];

            if (speedHeap.size() > k) {
                speedSum -= speedHeap.poll(); // evict smallest speed to respect team size k
            }

            long performance = speedSum * efficiency[i]; // efficiency[i] is current min among included
            best = Math.max(best, performance);
        }
        return (int) (best % MOD);
    }
}
```

## Key Takeaways
- Sorting by efficiency descending converts "minimum efficiency in team" into "efficiency of the engineer just processed" — a classic trick to fix one variable via traversal order.
- The min-heap caps team size at k by always evicting the smallest speed, which is optimal because a smaller speed contributes less to the sum being maximized.
- Take the modulo only on the final answer, not on intermediate `speedSum` — the max comparison must be done on true values.
