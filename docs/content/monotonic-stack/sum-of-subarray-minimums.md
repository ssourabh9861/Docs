# Sum of Subarray Minimums

**Difficulty:** Hard (rated Medium on LeetCode) · **Pattern:** monotonic stack contribution technique (previous/next smaller element) · [LeetCode](https://leetcode.com/problems/sum-of-subarray-minimums/)

## Problem
Given an array `arr`, find the sum of `min(b)` over every contiguous subarray `b` of `arr`. Return the answer modulo `10^9 + 7`.

## Examples
**Example 1**
```
Input:  arr = [3,1,2,4]
Output: 17
Explanation: Subarrays and their minimums:
[3]=3, [1]=1, [2]=2, [4]=4, [3,1]=1, [1,2]=1, [2,4]=2, [3,1,2]=1, [1,2,4]=1, [3,1,2,4]=1
Sum = 3+1+2+4+1+1+2+1+1+1 = 17
```

**Example 2**
```
Input:  arr = [11,81,94,43,3]
Output: 444
```

## Constraints
- `1 <= arr.length <= 3 * 10^4`
- `1 <= arr[i] <= 3 * 10^4`

## Approach 1 — Brute Force
**Idea.** Enumerate every subarray, track the running minimum as the right end extends, and add it to the total.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int sumSubarrayMins(int[] arr) {
        final int MOD = 1_000_000_007;
        long total = 0;
        for (int i = 0; i < arr.length; i++) {
            int min = arr[i];
            for (int j = i; j < arr.length; j++) {
                min = Math.min(min, arr[j]);
                total = (total + min) % MOD;
            }
        }
        return (int) total;
    }
}
```

## Approach 2 — Monotonic Stack Contribution Technique (optimal)
**Idea.** Instead of summing minima per subarray, sum each element's **contribution**: for `arr[i]`, count how many subarrays have `arr[i]` as their minimum, i.e. `left[i] * right[i]` where `left[i]` is the distance to the previous element that is *strictly less* than `arr[i]` (or the start), and `right[i]` is the distance to the next element that is *less than or equal* to `arr[i]` (or the end). The asymmetric tie-break (`<` on one side, `<=` on the other) avoids double-counting subarrays when duplicate values exist. Compute both distance arrays with a single pass each using a monotonic increasing stack.
**Complexity.** Time O(n), Space O(n).
```java
class Solution {
    public int sumSubarrayMins(int[] arr) {
        final int MOD = 1_000_000_007;
        int n = arr.length;
        int[] left = new int[n];  // count of subarrays ending at i where arr[i] is the min, extending left
        int[] right = new int[n]; // count extending right
        Deque<Integer> stack = new ArrayDeque<>();

        // previous strictly smaller element
        for (int i = 0; i < n; i++) {
            while (!stack.isEmpty() && arr[stack.peek()] >= arr[i]) stack.pop();
            left[i] = stack.isEmpty() ? i + 1 : i - stack.peek();
            stack.push(i);
        }
        stack.clear();

        // next smaller-or-equal element
        for (int i = n - 1; i >= 0; i--) {
            while (!stack.isEmpty() && arr[stack.peek()] > arr[i]) stack.pop();
            right[i] = stack.isEmpty() ? n - i : stack.peek() - i;
            stack.push(i);
        }

        long total = 0;
        for (int i = 0; i < n; i++) {
            total = (total + (long) arr[i] * left[i] % MOD * right[i]) % MOD;
        }
        return (int) total;
    }
}
```

## Key Takeaways
- The contribution technique — "how many subarrays is this element the extreme of" — is the standard way to turn an O(n^2) sum-over-subarrays problem into O(n).
- Break ties consistently (strict on one side, non-strict on the other) so equal-valued elements aren't double counted; getting this wrong is the classic bug in this pattern.
- The same skeleton (with `>` flipped) solves Sum of Subarray Maximums, and both halves combine directly into Sum of Subarray Ranges.
- Related: Sum of Subarray Ranges, Largest Rectangle in Histogram (same previous/next-smaller machinery).
