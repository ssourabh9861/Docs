# Minimum Number of Refueling Stops

**Difficulty:** Hard · **Pattern:** max-heap "refuel lazily, pick best fuel later" greedy · [LeetCode](https://leetcode.com/problems/minimum-number-of-refueling-stops/)

## Problem
A car starts at position 0 with `startFuel` gas and must reach `target`, using 1 unit of gas per unit distance. `stations[i] = [position, fuel]` lists gas stations along the way. Return the minimum number of refueling stops needed to reach `target`, or `-1` if impossible.

## Examples
**Example 1**
```
Input:  target = 100, startFuel = 1, stations = [[10,100]]
Output: -1
Explanation: With only 1 fuel, the car cannot even reach the station at position 10.
```

**Example 2**
```
Input:  target = 100, startFuel = 10, stations = [[10,60],[20,30],[30,30],[60,40]]
Output: 2
Explanation: Drive 10 to the first station, refuel to 60, drive to position 60 (using the largest banked fuel option), refuel again to reach 100.
```

## Constraints
- `1 <= target, startFuel <= 10^9`
- `0 <= stations.length <= 500`
- `0 <= position_i < position_{i+1} < target`
- `1 <= fuel_i < 10^9`

## Approach 1 — Max-Heap, Refuel Retroactively
**Idea.** Drive forward, and whenever the current fuel would not reach the next station (or the target), don't stop immediately at unreachable ground — instead, look back at every station already passed and greedily use the one with the largest fuel amount (a max-heap of passed stations' fuel) as if you had refueled there. This is valid because a stop's fuel can be "banked" and applied at any later point in the same trip; using the largest available fuel first minimizes the number of stops needed to bridge the gap. Push every station's fuel onto the heap as you pass it; whenever the tank runs dry before the next milestone, pop the max fuel and count a stop. If the heap empties and the tank still can't proceed, return `-1`.
**Complexity.** Time O(n log n), Space O(n).
```java
class Solution {
    public int minRefuelStops(int target, int startFuel, int[][] stations) {
        PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
        long fuel = startFuel;
        int stops = 0;
        int i = 0;
        int n = stations.length;

        while (fuel < target) {
            // pass all stations reachable with current fuel, banking their fuel
            while (i < n && stations[i][0] <= fuel) {
                maxHeap.offer(stations[i][1]);
                i++;
            }
            if (maxHeap.isEmpty()) return -1;
            fuel += maxHeap.poll();
            stops++;
        }
        return stops;
    }
}
```

## Approach 2 — DP on Reachable Distance per Stop Count
**Idea.** `dp[k]` = farthest distance reachable using exactly `k` stops. Initialize `dp[0] = startFuel`. For each station in order, for `k` from high to low, if `dp[k] >= station position`, update `dp[k+1] = max(dp[k+1], dp[k] + station fuel)`. The answer is the smallest `k` with `dp[k] >= target`. This DP baseline enumerates all stop-count possibilities explicitly, which the heap approach avoids by always making the single best local choice (largest banked fuel) when a stop becomes unavoidable.
**Complexity.** Time O(n^2), Space O(n).
```java
class Solution {
    public int minRefuelStops(int target, int startFuel, int[][] stations) {
        int n = stations.length;
        long[] dp = new long[n + 1];
        dp[0] = startFuel;

        for (int i = 0; i < n; i++) {
            for (int k = i; k >= 0; k--) {
                if (dp[k] >= stations[i][0]) {
                    dp[k + 1] = Math.max(dp[k + 1], dp[k] + stations[i][1]);
                }
            }
        }

        for (int k = 0; k <= n; k++) {
            if (dp[k] >= target) return k;
        }
        return -1;
    }
}
```

## Key Takeaways
- Greedy choice: when a stop becomes mandatory, retroactively "use" the largest fuel amount among all stations already passed — banking options and picking the best one late is equivalent to, and never worse than, committing early.
- The max-heap defers the decision of *which* station to use until it's forced, which is exactly what makes the choice always optimal (largest available at decision time).
- The DP baseline is more general (tracks reachability per exact stop count) but pays O(n^2); the heap greedy collapses it to O(n log n) by exploiting that only the maximum banked fuel ever needs to be used first.
