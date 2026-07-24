# Maximum Profit in Job Scheduling

**Difficulty:** Hard · **Pattern:** sort by end time + DP with binary search for last non-conflicting job · [LeetCode](https://leetcode.com/problems/maximum-profit-in-job-scheduling/)

## Problem
Given `startTime[i]`, `endTime[i]`, `profit[i]` for n jobs, choose a subset of non-overlapping jobs (job i and j conflict if their intervals overlap; touching at an endpoint is fine) to maximize total profit.

## Examples
**Example 1**
```
Input:  startTime = [1,2,3,3], endTime = [3,4,5,6], profit = [50,10,40,70]
Output: 120
Explanation: Take job [1,3] (profit 50) and job [3,6] (profit 70); they touch at 3, not overlapping. Total 120.
```

**Example 2**
```
Input:  startTime = [1,2,3,4,6], endTime = [3,5,10,6,9], profit = [20,20,100,70,60]
Output: 150
Explanation: Take [1,3] (20) and [3,10]... actually optimal is [1,3](20) + [4,6](70) + [6,9](60) = 150.
```

## Constraints
- 1 <= startTime.length == endTime.length == profit.length <= 5*10^4
- 1 <= startTime[i] < endTime[i] <= 10^9
- 1 <= profit[i] <= 10^4

## Approach 1 — Sort by start, memoized recursion + binary search
**Idea.** Sort jobs by start time. Define `dp(i)` = best profit achievable using jobs from index i onward. At each job i you either skip it (`dp(i+1)`) or take it (`profit[i] + dp(next)`, where `next` is the first job whose start >= `endTime[i]`, found via binary search on the sorted starts). Memoize on i. This is a top-down formulation of weighted interval scheduling.
**Complexity.** Time O(n log n) — n states, each doing a O(log n) binary search, Space O(n) for memo and recursion stack.
```java
class Solution {
    private int[][] jobs; // start, end, profit, sorted by start
    private Integer[] memo;

    public int jobScheduling(int[] startTime, int[] endTime, int[] profit) {
        int n = startTime.length;
        jobs = new int[n][3];
        for (int i = 0; i < n; i++) {
            jobs[i] = new int[]{startTime[i], endTime[i], profit[i]};
        }
        Arrays.sort(jobs, (a, b) -> Integer.compare(a[0], b[0]));
        memo = new Integer[n];
        return dp(0);
    }

    private int dp(int i) {
        if (i == jobs.length) return 0;
        if (memo[i] != null) return memo[i];

        int skip = dp(i + 1);
        int nextIndex = findNext(i + 1, jobs[i][1]);
        int take = jobs[i][2] + dp(nextIndex);

        return memo[i] = Math.max(skip, take);
    }

    // first index >= lo whose start >= targetEnd
    private int findNext(int lo, int targetEnd) {
        int hi = jobs.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (jobs[mid][0] >= targetEnd) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }
}
```

## Approach 2 — Sort by end time, bottom-up DP with binary search (optimal, iterative)
**Idea.** Sort jobs by end time. Let `dp[i]` = max profit using the first i jobs (in end-time order). For job i (1-indexed into dp), either skip it (`dp[i-1]`) or take it: `profit[i] + dp[k]` where k is the count of jobs whose end time <= this job's start time, found by binary searching the sorted end times. `dp[i] = max(dp[i-1], take)`. The final answer is `dp[n]`. This avoids recursion overhead and is the standard weighted-interval-scheduling DP.
**Complexity.** Time O(n log n), Space O(n) for the dp array and sorted job arrays.
```java
class Solution {
    public int jobScheduling(int[] startTime, int[] endTime, int[] profit) {
        int n = startTime.length;
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> Integer.compare(endTime[a], endTime[b]));

        int[] sortedStart = new int[n];
        int[] sortedEnd = new int[n];
        int[] sortedProfit = new int[n];
        for (int i = 0; i < n; i++) {
            sortedStart[i] = startTime[order[i]];
            sortedEnd[i] = endTime[order[i]];
            sortedProfit[i] = profit[order[i]];
        }

        int[] dp = new int[n + 1];
        for (int i = 1; i <= n; i++) {
            int k = upperBoundEnd(sortedEnd, i - 1, sortedStart[i - 1]);
            int take = sortedProfit[i - 1] + dp[k];
            dp[i] = Math.max(dp[i - 1], take);
        }
        return dp[n];
    }

    // count of jobs among sortedEnd[0..count) with end <= targetStart
    private int upperBoundEnd(int[] sortedEnd, int count, int targetStart) {
        int lo = 0, hi = count;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (sortedEnd[mid] <= targetStart) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }
}
```

## Key Takeaways
- This is weighted interval scheduling: greedy alone fails (unlike unweighted arrow/non-overlapping problems) because a lower-profit job might still be worth skipping a higher-profit conflicting one — DP is required.
- Sorting by end time makes "find the last compatible job" a simple binary search over a prefix of end times, giving the classic O(n log n) DP.
- The recursive (sort-by-start + memoized "take or skip with binary-search jump") and iterative (sort-by-end + bottom-up dp array) formulations solve the same recurrence; the iterative one avoids recursion depth concerns for n up to 5*10^4.
