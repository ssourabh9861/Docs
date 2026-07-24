# Subarray Sum Equals K

**Difficulty:** Medium · **Pattern:** Prefix sum + hashing · [LeetCode #560](https://leetcode.com/problems/subarray-sum-equals-k/)

## Problem

Given an array of integers `nums` and an integer `k`, return the **total number of
contiguous subarrays** whose sum equals `k`.

## Examples

**Example 1**
```
Input:  nums = [1,1,1], k = 2
Output: 2
Explanation: [1,1] (indices 0-1) and [1,1] (indices 1-2).
```

**Example 2**
```
Input:  nums = [1,2,3], k = 3
Output: 2
Explanation: [1,2] and [3].
```

## Constraints
- `1 <= nums.length <= 2 * 10^4`
- `-1000 <= nums[i] <= 1000`
- `-10^7 <= k <= 10^7`
- Values can be **negative**, so a sliding window does **not** work here.

## Approach 1 — Brute force (all subarrays)

**Idea.** Fix a left index, extend right, keep a running sum, count whenever it hits `k`.

**Complexity.** Time `O(n²)`, Space `O(1)`.

```java
public int subarraySum(int[] nums, int k) {
    int count = 0;
    for (int i = 0; i < nums.length; i++) {
        int sum = 0;
        for (int j = i; j < nums.length; j++) {
            sum += nums[j];
            if (sum == k) count++;
        }
    }
    return count;
}
```

## Approach 2 — Prefix sum + HashMap (optimal)

**Idea.** Let `pre[i]` be the sum of the first `i` elements. A subarray `(j, i]` sums to
`k` iff `pre[i] - pre[j] == k`, i.e. `pre[j] == pre[i] - k`. Sweep left to right keeping
a map from *prefix-sum value → how many times it has occurred*. For each new prefix sum,
add the number of earlier prefixes equal to `sum - k`.

Seed the map with `{0: 1}` to count subarrays that start at index 0.

**Complexity.** Time `O(n)`, Space `O(n)`.

```java
import java.util.HashMap;
import java.util.Map;

public int subarraySum(int[] nums, int k) {
    Map<Integer, Integer> count = new HashMap<>();
    count.put(0, 1);              // empty prefix
    int sum = 0, ans = 0;
    for (int x : nums) {
        sum += x;
        ans += count.getOrDefault(sum - k, 0);
        count.merge(sum, 1, Integer::sum);
    }
    return ans;
}
```

## Key Takeaways
- **Prefix sum + hashmap** turns "count subarrays with sum k" from `O(n²)` into `O(n)`.
- Seeding `{0:1}` is what lets prefixes that begin at index 0 be counted.
- Because values may be negative, **sliding window is invalid** — this is the classic trap.
- Same template solves *Subarray Sums Divisible by K* (key on `sum % k`) and
  *Continuous Subarray Sum* (store first index of each remainder).
