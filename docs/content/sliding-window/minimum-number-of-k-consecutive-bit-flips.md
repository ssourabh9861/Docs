# Minimum Number of K Consecutive Bit Flips

**Difficulty:** Hard · **Pattern:** Fixed-size window with lazy "flip count" tracked via difference marker · [LeetCode](https://leetcode.com/problems/minimum-number-of-k-consecutive-bit-flips/)

## Problem
Given a binary array `nums` and an integer `k`, a flip operation chooses a contiguous subarray of length `k` and flips every 0 to 1 and every 1 to 0 in it. Return the minimum number of flips needed to make all elements 1, or `-1` if impossible.

## Examples
**Example 1**
```
Input:  nums = [0,1,0], k = 1
Output: 2
Explanation: Flip index 0, then flip index 2: [0,1,0] -> [1,1,0] -> [1,1,1].
```
**Example 2**
```
Input:  nums = [1,1,0], k = 2
Output: -1
Explanation: No sequence of flips of length 2 turns all elements into 1.
```
**Example 3**
```
Input:  nums = [0,0,0,1,0,1,1,0], k = 3
Output: 3
Explanation: Flip at indices 0, 4, 5: [0,0,0,...] -> [1,1,1,1,0,1,1,0] -> [1,1,1,1,1,0,0,0] -> [1,1,1,1,1,1,1,1].
```

## Constraints
- `1 <= nums.length <= 10^5`
- `1 <= k <= nums.length`

## Approach 1 — Brute Force Simulation
**Idea.** Greedily scan left to right; whenever a 0 is found, flip the next `k` elements in place (actually mutate the array), counting flips. If a required flip would run past the array end, it's impossible.
**Complexity.** Time O(n·k) (each flip touches k elements), Space O(1) extra (in-place).
```java
class Solution {
    public int minKBitFlips(int[] nums, int k) {
        int n = nums.length, flips = 0;
        for (int i = 0; i <= n - k; i++) {
            if (nums[i] == 0) {
                flipRange(nums, i, k);
                flips++;
            }
        }
        // verify all 1s (any leftover 0 in the last k-1 positions means impossible)
        for (int i = Math.max(0, n - k + 1); i < n; i++) {
            if (nums[i] == 0) return -1;
        }
        return flips;
    }

    private void flipRange(int[] nums, int start, int k) {
        for (int i = start; i < start + k; i++) {
            nums[i] ^= 1;
        }
    }
}
```

## Approach 2 — Sliding Window with Difference Array Marker (optimal)
**Idea.** Avoid actually flipping k elements each time. Track the *cumulative parity* of flips affecting the current index using a difference-array style marker: keep a running `flipCount` (number of flips started in the last `k` positions that are still "active" at `i`) via a `diff` array where `diff[i]` records "a flip effect starting at i ends its influence at i+k". At each index `i`, first remove the effect of any flip that started exactly `k` positions ago (`flipCount -= diff[i]`), then determine the *effective current value* = `nums[i] XOR (flipCount % 2)`. If that's 0, we must start a new flip at `i` — increment `flipCount`, mark `diff[i + k] = 1` (or bail out if `i + k > n`, meaning impossible), and increment the answer.
**Complexity.** Time O(n), Space O(n) for the diff array (can be reduced to O(k) with a boolean queue).
```java
class Solution {
    public int minKBitFlips(int[] nums, int k) {
        int n = nums.length;
        int[] diff = new int[n + 1]; // diff[i] = 1 means a flip's effect ends at i
        int flipCount = 0, answer = 0;

        for (int i = 0; i < n; i++) {
            flipCount += diff[i];
            // effective value after applying all still-active flips
            int effective = (nums[i] + flipCount) % 2;
            if (effective == 0) {
                if (i + k > n) return -1; // can't start a flip window here
                answer++;
                flipCount++;
                diff[i + k]++; // this flip's effect ends at i + k
            }
        }
        return answer;
    }
}
```

## Approach 3 — Sliding Window with Deque of Flip Starts (space-optimized)
**Idea.** Instead of an O(n) diff array, keep a deque (or just a size counter) of active flip start-indices. At index `i`, pop starts from the front that are `<= i - k` (their effect has expired). The parity of the deque's size tells you whether `nums[i]` is currently flipped. If the effective value is 0, push `i` as a new flip start (or return -1 if `i + k > n`).
**Complexity.** Time O(n), Space O(k) worst case for the deque.
```java
class Solution {
    public int minKBitFlips(int[] nums, int k) {
        int n = nums.length;
        java.util.Deque<Integer> activeFlips = new java.util.ArrayDeque<>();
        int answer = 0;

        for (int i = 0; i < n; i++) {
            while (!activeFlips.isEmpty() && activeFlips.peekFirst() <= i - k) {
                activeFlips.pollFirst();
            }
            int effective = (nums[i] + activeFlips.size()) % 2;
            if (effective == 0) {
                if (i + k > n) return -1;
                activeFlips.offerLast(i);
                answer++;
            }
        }
        return answer;
    }
}
```

## Key Takeaways
- The core trick is avoiding actually mutating `k` elements per flip by tracking only the *parity* of how many active flips cover the current index — a difference array (or deque of active starts) turns O(n·k) into O(n).
- Classic trap: forgetting that `nums[i]`'s effective value depends on the *parity* of overlapping flips, not just whether any flip is active — two overlapping flips cancel out.
- Related problems: Sliding Window Maximum (deque-based window tracking), Car Pooling / Range Addition (difference array technique), Corporate Flight Bookings.
