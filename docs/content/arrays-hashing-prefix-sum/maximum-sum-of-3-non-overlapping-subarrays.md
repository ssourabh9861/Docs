# Maximum Sum of 3 Non-Overlapping Subarrays

**Difficulty:** Hard · **Pattern:** Prefix/window sums + left-best/right-best DP · [LeetCode #689](https://leetcode.com/problems/maximum-sum-of-3-non-overlapping-subarrays/)

## Problem

Given an array `nums` and an integer `k`, find three non-overlapping subarrays each of
length `k` whose total sum is maximized. Return their starting indices; if multiple
answers have the same max sum, return the lexicographically smallest index array.

## Examples

**Example 1**
```
Input:  nums = [1,2,1,2,6,7,5,1], k = 2
Output: [0,3,5]
Explanation: Subarrays [1,2], [2,6], [7,5] starting at 0, 3, 5 sum to 23, the maximum.
```

**Example 2**
```
Input:  nums = [1,2,1,2,1,2,1,2,1], k = 2
Output: [0,2,4]
```

## Constraints
- `1 <= nums.length <= 2 * 10^4`
- `1 <= nums[i] < 2^16`
- `1 <= k <= floor(nums.length / 3)`

## Approach 1 — Brute force with prefix sums

**Idea.** Precompute prefix sums so any length-`k` window sum is `O(1)`. Triple-nest
over the three (non-overlapping) start indices and track the max total.

**Complexity.** Time `O(n³)`, Space `O(n)`.

```java
public int[] maxSumOfThreeSubarrays(int[] nums, int k) {
    int n = nums.length;
    long[] prefix = new long[n + 1];
    for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];

    long best = -1;
    int[] ans = new int[3];
    for (int i = 0; i + k <= n; i++) {
        for (int j = i + k; j + k <= n; j++) {
            for (int l = j + k; l + k <= n; l++) {
                long total = (prefix[i + k] - prefix[i])
                           + (prefix[j + k] - prefix[j])
                           + (prefix[l + k] - prefix[l]);
                if (total > best) {
                    best = total;
                    ans = new int[]{i, j, l};
                }
            }
        }
    }
    return ans;
}
```

## Approach 2 — Precomputed left-best / right-best windows (optimal)

**Idea.** First compute `windowSum[i]` = sum of `nums[i..i+k-1]` for every valid start
`i`, via a rolling sum. Then precompute, for every position `i`:
- `left[i]` = index of the best (max-sum, then leftmost) window start in `[0, i]`.
- `right[i]` = index of the best window start in `[i, m-1]` (ties favor the leftmost
  index, achieved by scanning right-to-left with `>=`).

Now sweep the **middle** window's start `j`; the optimal left window ends right before
`j` and the optimal right window starts right after — both already known in `O(1)` via
`left[j-k]` and `right[j+k]`.

**Complexity.** Time `O(n)`, Space `O(n)`.

```java
public int[] maxSumOfThreeSubarrays(int[] nums, int k) {
    int n = nums.length;
    int[] windowSum = new int[n - k + 1];
    int sum = 0;
    for (int i = 0; i < n; i++) {
        sum += nums[i];
        if (i >= k) sum -= nums[i - k];
        if (i >= k - 1) windowSum[i - k + 1] = sum;
    }

    int m = windowSum.length;
    int[] left = new int[m];
    int best = 0;
    for (int i = 0; i < m; i++) {
        if (windowSum[i] > windowSum[best]) best = i;
        left[i] = best;
    }

    int[] right = new int[m];
    best = m - 1;
    for (int i = m - 1; i >= 0; i--) {
        if (windowSum[i] >= windowSum[best]) best = i;
        right[i] = best;
    }

    int[] ans = new int[3];
    int maxTotal = -1;
    for (int j = k; j <= m - 1 - k; j++) {
        int l = left[j - k];
        int r = right[j + k];
        int total = windowSum[l] + windowSum[j] + windowSum[r];
        if (total > maxTotal) {
            maxTotal = total;
            ans = new int[]{l, j, r};
        }
    }
    return ans;
}
```

## Key Takeaways
- Precomputing the best window to the left and to the right of every position converts
  an `O(n³)` triple search into a single `O(n)` sweep over the middle window — a
  reusable "fix the middle, look up both sides" DP shape.
- Tie-breaking direction is what produces the lexicographically smallest answer: `left[]`
  uses strict `>` (keep the earliest max seen), `right[]` uses `>=` while scanning from
  the end (also keeps the earliest index among ties).
- Window sums themselves are just a rolling/prefix sum — the same primitive used
  throughout this topic, just applied to fixed-length windows instead of arbitrary ones.
