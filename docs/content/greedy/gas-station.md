# Gas Station

**Difficulty:** Medium · **Pattern:** running-tank reset greedy · [LeetCode](https://leetcode.com/problems/gas-station/)

## Problem
There are `n` gas stations in a circle, each with `gas[i]` fuel and a cost `cost[i]` to travel to the next station. Starting with an empty tank at some station, return the starting index that lets you complete the circuit once, or `-1` if none exists (the answer is guaranteed unique if it exists).

## Examples
**Example 1**
```
Input:  gas = [1,2,3,4,5], cost = [3,4,5,1,2]
Output: 3
Explanation: Start at station 3 (index 3): tank = 4-1=3 -> +5-2=6 -> +1-3=4 -> +2-4=2 -> +3-5=0, completes the loop.
```

**Example 2**
```
Input:  gas = [2,3,4], cost = [3,4,3]
Output: -1
Explanation: Total gas (9) < total cost (10), so no starting point works.
```

## Constraints
- `n == gas.length == cost.length`
- `1 <= n <= 10^5`
- `0 <= gas[i], cost[i] <= 10^4`

## Approach 1 — Single Pass, Reset on Deficit
**Idea.** If `sum(gas) < sum(cost)`, no solution exists. Otherwise, walk once tracking a running tank `total`. Whenever the tank goes negative at station `i`, no station between the current `start` and `i` can be the answer either — starting anywhere in `[start, i]` only inherits a worse (or equal) deficit by the time it reaches `i`, since each prefix sum from within that range is non-negative up to its own start and the shortfall is cumulative. So reset `start = i + 1` and continue accumulating. Because total gas >= total cost, the last surviving `start` is guaranteed to complete the loop. This is the exchange argument: any candidate inside a failed range is dominated by simply skipping to the failure point.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int canCompleteCircuit(int[] gas, int[] cost) {
        int totalTank = 0, curTank = 0, start = 0;
        for (int i = 0; i < gas.length; i++) {
            int diff = gas[i] - cost[i];
            totalTank += diff;
            curTank += diff;
            if (curTank < 0) {
                start = i + 1;
                curTank = 0;
            }
        }
        return totalTank >= 0 ? start : -1;
    }
}
```

## Approach 2 — Brute Force Simulation (Baseline)
**Idea.** Try every start index and simulate the full loop, verifying the tank never goes negative. Establishes correctness directly but redoes work already implied by earlier failed starts — the greedy version reuses that work by never re-simulating a doomed prefix.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int canCompleteCircuit(int[] gas, int[] cost) {
        int n = gas.length;
        for (int start = 0; start < n; start++) {
            int tank = 0;
            boolean ok = true;
            for (int step = 0; step < n; step++) {
                int i = (start + step) % n;
                tank += gas[i] - cost[i];
                if (tank < 0) { ok = false; break; }
            }
            if (ok) return start;
        }
        return -1;
    }
}
```

## Key Takeaways
- Feasibility check first: if total gas < total cost, immediately return `-1` — no rotation can fix a global deficit.
- Greedy choice: on any tank deficit, jump the candidate start past the failure point, because every index in between is provably unreachable as a valid start.
- The single pass works because the circuit's total surplus guarantees exactly one surviving start point once all bad ranges are skipped.
