# Count Number of Nice Subarrays

**Difficulty:** Medium · **Pattern:** atMost(k) - atMost(k-1) trick applied to odd-count · [LeetCode](https://leetcode.com/problems/count-number-of-nice-subarrays/)

## Problem
Given an array `nums` and an integer `k`, count the number of contiguous subarrays that contain exactly `k` odd numbers.

## Examples
**Example 1**
```
Input:  nums = [1,1,2,1,1], k = 3
Output: 2
Explanation: The subarrays with exactly 3 odd numbers are [1,1,2,1] and [1,2,1,1].
```
**Example 2**
```
Input:  nums = [2,4,6], k = 1
Output: 0
Explanation: There are no odd numbers, so no subarray can have exactly 1 odd number.
```

## Constraints
- `1 <= nums.length <= 5 * 10^4`
- `1 <= nums[i] <= 10^5`
- `1 <= k <= nums.length`

## Approach 1 — Brute Force
**Idea.** For every start index, extend the end index while counting odd numbers seen so far; whenever the odd count equals `k`, increment the result.
**Complexity.** Time O(n²), Space O(1).
```java
class Solution {
    public int numberOfSubarrays(int[] nums, int k) {
        int n = nums.length, count = 0;
        for (int i = 0; i < n; i++) {
            int oddCount = 0;
            for (int j = i; j < n; j++) {
                if (nums[j] % 2 == 1) oddCount++;
                if (oddCount == k) count++;
                if (oddCount > k) break;
            }
        }
        return count;
    }
}
```

## Approach 2 — atMost(k) - atMost(k-1) (optimal)
**Idea.** Reduce "nice" (exactly k odd numbers) to the difference of two "at most" counts: `atMost(k)` counts subarrays with at most `k` odd numbers using a standard shrinking window (while odd count exceeds `k`, move `left` forward; each valid right boundary contributes `right - left + 1` subarrays). Then `exactly(k) = atMost(k) - atMost(k-1)`, exactly as in Subarrays with K Different Integers — only here the "distinctness" metric is replaced by a running count of odd elements.
**Complexity.** Time O(n) (two linear passes), Space O(1).
```java
class Solution {
    public int numberOfSubarrays(int[] nums, int k) {
        return atMost(nums, k) - atMost(nums, k - 1);
    }

    private int atMost(int[] nums, int k) {
        if (k < 0) return 0;
        int left = 0, oddCount = 0, count = 0;
        for (int right = 0; right < nums.length; right++) {
            if (nums[right] % 2 == 1) oddCount++;

            while (oddCount > k) {
                if (nums[left] % 2 == 1) oddCount--;
                left++;
            }
            count += right - left + 1;
        }
        return count;
    }
}
```

## Approach 3 — Prefix Sum of Odd-Count with HashMap (equivalent optimal)
**Idea.** Let `oddPrefix[i]` be the number of odd numbers in `nums[0..i-1]`. A subarray `nums[l..r]` has exactly `k` odd numbers iff `oddPrefix[r+1] - oddPrefix[l] == k`. Scan once, maintaining a running odd-count and a frequency map of `oddPrefix` values seen so far; at each step, add `freqMap[currentOddCount - k]` to the answer.
**Complexity.** Time O(n), Space O(n) for the frequency map.
```java
class Solution {
    public int numberOfSubarrays(int[] nums, int k) {
        java.util.Map<Integer, Integer> freq = new java.util.HashMap<>();
        freq.put(0, 1); // empty prefix has 0 odd numbers
        int oddCount = 0, result = 0;

        for (int num : nums) {
            if (num % 2 == 1) oddCount++;
            result += freq.getOrDefault(oddCount - k, 0);
            freq.merge(oddCount, 1, Integer::sum);
        }
        return result;
    }
}
```

## Key Takeaways
- Recognizing "exactly k odd numbers" as structurally identical to "exactly k distinct" (Subarrays with K Different Integers) is the key transfer: both reduce to `atMost(k) - atMost(k-1)` because "at most" is monotonic while "exactly" is not.
- The prefix-sum + hashmap approach (Approach 3) is the general technique for "subarray sum equals target" — here the "sum" is just the odd-count, so it doubles as a second valid optimal solution.
- Classic trap: replacing odd numbers with `nums[i] % 2` and forgetting negative numbers can make `% 2` return `-1` in Java for negative odds — not an issue here since constraints guarantee positive values, but worth checking constraints before reusing this pattern.
- Related problems: Subarrays with K Different Integers, Subarray Sum Equals K, Binary Subarrays with Sum.
