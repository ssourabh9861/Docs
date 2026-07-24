# Boats to Save People

**Difficulty:** Medium · **Pattern:** Sort + opposite-end two pointers, greedy pairing of lightest with heaviest · [LeetCode](https://leetcode.com/problems/boats-to-save-people/)

## Problem
Given people's weights and a per-boat weight limit, each boat can carry at most two people as long as their combined weight doesn't exceed the limit. Find the minimum number of boats needed to carry everyone.

## Examples
**Example 1**
```
Input:  people = [3,2,2,1], limit = 3
Output: 3
Explanation: One boat takes (1,2), another takes (2), another takes (3).
```
**Example 2**
```
Input:  people = [3,5,3,4], limit = 5
Output: 4
Explanation: Every person needs their own boat since no two can be paired under the limit.
```

## Constraints
- 1 <= people.length <= 5 * 10^4
- 1 <= people[i] <= limit <= 3 * 10^4

## Approach 1 — Brute force pairing simulation
**Idea.** Repeatedly pick the heaviest unassigned person, then scan for the heaviest remaining person that still fits with them, remove both, and count a boat. Repeat until everyone is assigned.
**Complexity.** Time O(n^2) due to repeated linear scans, Space O(n) for tracking assigned status.
```java
import java.util.*;

class Solution {
    public int numRescueBoatsBruteForce(int[] people, int limit) {
        int n = people.length;
        Integer[] idx = new Integer[n];
        for (int i = 0; i < n; i++) idx[i] = i;
        Arrays.sort(idx, (a, b) -> people[b] - people[a]); // descending
        boolean[] used = new boolean[n];
        int boats = 0;
        for (int i = 0; i < n; i++) {
            int pi = idx[i];
            if (used[pi]) continue;
            used[pi] = true;
            int remaining = limit - people[pi];
            for (int j = n - 1; j > i; j--) {
                int pj = idx[j];
                if (!used[pj] && people[pj] <= remaining) {
                    used[pj] = true;
                    break;
                }
            }
            boats++;
        }
        return boats;
    }
}
```

## Approach 2 — Sort + two pointers (optimal)
**Idea.** Sort people by weight. Use pointers `light` at the start and `heavy` at the end. Always try to pair the heaviest remaining person with the lightest remaining person: if their sum fits the limit, take both (advance both pointers); otherwise the heaviest person must go alone (advance only `heavy`). This greedily maximizes pairing since if the heaviest can't pair with the lightest, it can't pair with anyone.
**Complexity.** Time O(n log n) for the sort (two-pointer scan itself is O(n)), Space O(1) extra (O(log n) for sort).
```java
import java.util.Arrays;

class Solution {
    public int numRescueBoats(int[] people, int limit) {
        Arrays.sort(people);
        int light = 0, heavy = people.length - 1;
        int boats = 0;
        while (light <= heavy) {
            if (people[light] + people[heavy] <= limit) {
                light++;   // lightest person paired successfully
            }
            heavy--;       // heaviest person always leaves, paired or alone
            boats++;
        }
        return boats;
    }
}
```

## Key Takeaways
- Greedy correctness: since every boat holds at most 2, and the heaviest person can never fit with anyone lighter than the current lightest can't-fit test allows, pairing heaviest with lightest whenever possible is always optimal (never wastes capacity).
- `heavy` always decrements every iteration (that person always leaves, whether paired or solo); `light` only advances when a pair actually forms — a subtle but load-bearing asymmetry.
- Sorting turns an unordered pairing problem into a converging two-pointer greedy — same family as Container With Most Water, but the decision rule differs (greedy match vs area maximization).
- Related problems: Two Sum II (sorted), Container With Most Water.
