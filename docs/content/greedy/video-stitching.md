# Video Stitching

**Difficulty:** Medium · **Pattern:** coverage / reach-extension greedy · [LeetCode](https://leetcode.com/problems/video-stitching/)

## Problem
Given clips `clips[i] = [start, end]` and a target duration `time`, return the minimum number of clips needed to cover `[0, time]` exactly (clips can overlap and be trimmed), or `-1` if it's impossible.

## Examples
**Example 1**
```
Input:  clips = [[0,2],[4,6],[8,10],[1,9],[1,5],[5,9]], time = 10
Output: 3
Explanation: Use [0,2] then [1,9] (covers 2 to 9) then [8,10] (covers 9 to 10).
```

**Example 2**
```
Input:  clips = [[0,1],[1,2]], time = 5
Output: -1
Explanation: No clip covers past time 2, so [2,5] can never be reached.
```

## Constraints
- `1 <= clips.length <= 100`
- `0 <= start_i <= end_i <= 100`
- `1 <= time <= 100`

## Approach 1 — Greedy Reach Extension (Jump-Game Style)
**Idea.** This is structurally identical to Jump Game II: treat each covered position as needing the farthest possible extension. Sort clips by start time. Sweep target positions from 0 upward in "rounds": within the current covered range `[0, curEnd]`, look at all clips whose start `<= curEnd` and track the farthest `end` reachable (`farthest`). If no clip extends past `curEnd`, coverage is stuck — return `-1`. Otherwise take one clip (increment count), advance `curEnd = farthest`, and repeat until `curEnd >= time`. The greedy choice — always extending to the farthest reachable endpoint among usable clips — is safe because any clip reaching less far is dominated: it covers a subset of what the farthest clip covers, so it can never enable something the farthest choice couldn't.
**Complexity.** Time O(n log n) for the sort, O(n) for the sweep. Space O(1) extra.
```java
class Solution {
    public int videoStitching(int[][] clips, int time) {
        Arrays.sort(clips, (a, b) -> a[0] - b[0]);

        int n = clips.length;
        int curEnd = 0, farthest = 0, count = 0, i = 0;

        while (curEnd < time) {
            while (i < n && clips[i][0] <= curEnd) {
                farthest = Math.max(farthest, clips[i][1]);
                i++;
            }
            if (farthest <= curEnd) return -1; // stuck, no clip extends coverage
            count++;
            curEnd = farthest;
        }
        return count;
    }
}
```

## Approach 2 — DP on Best End Reachable per Position
**Idea.** `maxReach[s]` = the farthest `end` achievable by any clip starting at exactly position `s` (take the max over duplicates). Then `dp[t]` = minimum clips to cover `[0, t]`, computed similarly to Jump Game II's DP: for each position `t` from 1 to `time`, scan back to find the best predecessor. In practice this is usually implemented as: build an array `maxEnd[start] = max end over clips with that start`, then greedily walk forward tracking `curEnd`/`nextEnd` exactly as in Approach 1 — this "array indexed by start" variant avoids sorting by using counting-sort-like bucketing over the bounded range `[0, 100]`.
**Complexity.** Time O(n + time), Space O(time).
```java
class Solution {
    public int videoStitching(int[][] clips, int time) {
        int[] maxEnd = new int[time + 1];
        for (int[] clip : clips) {
            if (clip[0] <= time) {
                maxEnd[clip[0]] = Math.max(maxEnd[clip[0]], clip[1]);
            }
        }

        int curEnd = 0, farthest = 0, count = 0;
        for (int s = 0; s <= time; s++) {
            if (s > curEnd) {
                if (farthest <= curEnd) return -1;
                curEnd = farthest;
                count++;
            }
            farthest = Math.max(farthest, maxEnd[s]);
        }
        return curEnd >= time ? count : -1;
    }
}
```

## Key Takeaways
- This problem is Jump Game II in disguise: "positions" are timeline points, and each clip's `[start, end]` acts like a jump from `start` reaching as far as `end`.
- Greedy choice: within the current reachable window, always take the clip with the maximum `end` — a clip with a smaller reach is always dominated and never needs consideration.
- Bucketing clips by integer start position (bounded by `time <= 100`) avoids an explicit sort, trading O(n log n) for O(n + time), useful when the value range is small.
