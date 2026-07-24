# Number of Ways to Wear Different Hats to Each Other

**Difficulty:** Very Hard · **Pattern:** bitmask DP over people, iterating by hat (dp over hats assigning to a people-bitmask) · [LeetCode](https://leetcode.com/problems/number-of-ways-to-wear-different-hats-to-each-other/)

## Problem
Given `hats[i]` = list of hat types (`1..40`) that person `i` likes, count the number of ways to assign a distinct hat to every person such that each person gets a hat from their own liking list. Return the count modulo `10^9 + 7`.

## Examples
**Example 1**
```
Input:  hats = [[3,4],[4,5],[5]]
Output: 1
Explanation: Only valid assignment: person0->3, person1->4, person2->5 (hat 4 or 5 shared
             but person2 only likes 5, forcing person1 to take 4, forcing person0 to take 3).
```
**Example 2**
```
Input:  hats = [[3,5,1],[3,5]]
Output: 4
Explanation: Valid pairs (person0, person1): (1,3), (1,5), (5,3), (3,5) -> 4 distinct assignments.
```

## Constraints
- `n == hats.length`
- `1 <= n <= 10`
- `1 <= hats[i].length <= 40`
- `1 <= hats[i][j] <= 40`
- All values in `hats[i]` are distinct.

## Approach 1 — DP over hats (1..40), each hat given to at most one unassigned person
**Idea.** Since there can be up to 40 hats but only up to 10 people, iterate by hat index, and let the DP state be a bitmask over **people** (not hats — the mask is small, size `2^10 = 1024`, since `n <= 10`). Precompute `hatToPeople[h]` = list of people who like hat `h`. Define `dp[h][mask]` = number of ways to assign hats `1..h` such that exactly the people in `mask` have received a hat so far. Transition per hat `h`: either don't use hat `h` at all (`dp[h][mask] += dp[h-1][mask]`), or give hat `h` to one specific person `p` in `hatToPeople[h]` who is not yet in `mask` (`dp[h][mask | (1<<p)] += dp[h-1][mask]`). Answer is `dp[40][fullMask]` where `fullMask = (1<<n) - 1`.

**Complexity.** Time O(40 · 2^n · n) (per hat, per mask, try each liking person), Space O(2^n) with rolling hat dimension.
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int numberWays(List<List<Integer>> hats) {
        int n = hats.size();
        int full = 1 << n;

        List<List<Integer>> hatToPeople = new ArrayList<>();
        for (int h = 0; h <= 40; h++) hatToPeople.add(new ArrayList<>());
        for (int person = 0; person < n; person++) {
            for (int hat : hats.get(person)) {
                hatToPeople.get(hat).add(person);
            }
        }

        long[] dp = new long[full];
        dp[0] = 1; // 0 hats assigned so far, no one has a hat: 1 way (the empty assignment)

        for (int h = 1; h <= 40; h++) {
            long[] next = dp.clone(); // option: don't use hat h at all
            for (int mask = 0; mask < full; mask++) {
                if (dp[mask] == 0) continue;
                for (int person : hatToPeople.get(h)) {
                    if ((mask & (1 << person)) != 0) continue; // already has a hat
                    int newMask = mask | (1 << person);
                    next[newMask] = (next[newMask] + dp[mask]) % MOD;
                }
            }
            dp = next;
        }

        return (int) dp[full - 1];
    }
}
```
*(needs `import java.util.*;`)*

## Approach 2 — Same DP, 2D array indexed by hat (optimal, identical complexity, explicit hat dimension)
**Idea.** Functionally the same recurrence as Approach 1, kept as an explicit `dp[hat][mask]` 2D table instead of rolling arrays — useful if you need to inspect intermediate hat layers, but otherwise equivalent. This form makes the "hat-by-hat" DP structure maximally explicit for revision purposes.

**Complexity.** Time O(40 · 2^n · n), Space O(40 · 2^n).
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int numberWays(List<List<Integer>> hats) {
        int n = hats.size();
        int full = 1 << n;

        List<List<Integer>> hatToPeople = new ArrayList<>();
        for (int h = 0; h <= 40; h++) hatToPeople.add(new ArrayList<>());
        for (int person = 0; person < n; person++) {
            for (int hat : hats.get(person)) {
                hatToPeople.get(hat).add(person);
            }
        }

        long[][] dp = new long[41][full];
        dp[0][0] = 1;

        for (int h = 1; h <= 40; h++) {
            for (int mask = 0; mask < full; mask++) {
                // Option A: hat h is not used by anyone.
                dp[h][mask] = dp[h - 1][mask];
            }
            for (int mask = 0; mask < full; mask++) {
                if (dp[h - 1][mask] == 0) continue;
                // Option B: hat h is given to exactly one eligible, not-yet-assigned person.
                for (int person : hatToPeople.get(h)) {
                    if ((mask & (1 << person)) != 0) continue;
                    int newMask = mask | (1 << person);
                    dp[h][newMask] = (dp[h][newMask] + dp[h - 1][mask]) % MOD;
                }
            }
        }

        return (int) dp[40][full - 1];
    }
}
```

## Key Takeaways
- The bitmask must be over **people** (`n <= 10`, so `2^n <= 1024`), not hats (`40` of them) — iterating hats as the outer DP dimension while masking people is what keeps the state space small; masking over 40 hats would be `2^40`, infeasible.
- Each hat contributes two options per state: skip it entirely, or award it to exactly one still-unassigned person who likes it — never more than one person per hat, which is what "distinct hats" enforces structurally.
- Rolling the hat dimension down to a single 1D array (Approach 1) versus keeping it explicit (Approach 2) is a pure space/clarity trade-off; both share the identical `O(40 · 2^n · n)` time bound.
