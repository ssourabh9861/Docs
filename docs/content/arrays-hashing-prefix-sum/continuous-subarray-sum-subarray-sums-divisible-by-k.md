# Continuous Subarray Sum / Subarray Sums Divisible by K

**Difficulty:** Medium · **Pattern:** Prefix sum modulo k + hashmap · [LeetCode #523](https://leetcode.com/problems/continuous-subarray-sum/)

## Problem

Two problems built on the same prefix-sum-modulo idea:
- **Continuous Subarray Sum (LC 523):** given `nums` and `k`, determine whether
  `nums` has a contiguous subarray of **size at least 2** whose sum is a multiple of `k`.
- **Subarray Sums Divisible by K (LC 974):** given `nums` and `k`, count the number of
  (non-empty) contiguous subarrays whose sum is divisible by `k`.

## Examples

**Example 1 (LC 523)**
```
Input:  nums = [23,2,4,6,7], k = 6
Output: true
Explanation: [2,4] sums to 6, a multiple of 6, and has length >= 2.
```

**Example 2 (LC 974)**
```
Input:  nums = [4,5,0,-2,-3,1], k = 5
Output: 7
Explanation: Subarrays with sum divisible by 5: [4,5,0,-2,-3], [5,0], [5,0,-2,-3],
[0], [0,-2,-3], [-2,-3], [4,5,0,-2,-3,1]... (7 total).
```

## Constraints
**LC 523**
- `1 <= nums.length <= 10^5`
- `0 <= nums[i] <= 10^9`
- `0 <= sum(nums[i]) <= 2^31 - 1`
- `1 <= k <= 2^31 - 1`

**LC 974**
- `1 <= nums.length <= 3 * 10^4`
- `-10^4 <= nums[i] <= 10^4`
- `2 <= k <= 10^4`

## Approach 1 — Brute force

**Idea.** For each start index, extend the end index, keep a running sum, and check
divisibility by `k` (with the length `>= 2` condition for LC 523).

**Complexity.** Time `O(n²)`, Space `O(1)`.

```java
public boolean checkSubarraySum(int[] nums, int k) {
    int n = nums.length;
    for (int i = 0; i < n; i++) {
        long sum = nums[i];
        for (int j = i + 1; j < n; j++) {
            sum += nums[j];
            if (sum % k == 0) return true; // length j-i+1 >= 2
        }
    }
    return false;
}
```

## Approach 2 — Prefix sum modulo k + hashmap (optimal)

**Idea.** If `prefix[i] % k == prefix[j] % k` for `i < j`, the subarray `(i, j]` sums to
a multiple of `k`. Sweep once, tracking remainders in a map:
- **LC 523** stores the **first index** at which each remainder occurred (seeded with
  `{0: -1}` for the empty prefix). If the same remainder reappears at distance `>= 2`,
  return `true` — using the *first* occurrence maximizes the gap, giving the best shot
  at reaching length 2.
- **LC 974** stores a **running count** of how many times each remainder has occurred;
  every repeat contributes that many new valid subarrays, so accumulate
  `count[remainder]` into the answer before incrementing it (seeded with `{0: 1}`).

Java's `%` can return a negative value for negative sums — normalize with
`((sum % k) + k) % k`.

**Complexity.** Both `O(n)` time, `O(min(n, k))` space.

```java
import java.util.HashMap;
import java.util.Map;

// LC 523 — Continuous Subarray Sum
public boolean checkSubarraySum(int[] nums, int k) {
    Map<Integer, Integer> firstIndex = new HashMap<>();
    firstIndex.put(0, -1);
    long sum = 0;
    for (int i = 0; i < nums.length; i++) {
        sum += nums[i];
        int rem = (int) (sum % k);
        Integer prev = firstIndex.get(rem);
        if (prev != null) {
            if (i - prev >= 2) return true;
        } else {
            firstIndex.put(rem, i);
        }
    }
    return false;
}
```

```java
import java.util.HashMap;
import java.util.Map;

// LC 974 — Subarray Sums Divisible by K
public int subarraysDivByK(int[] nums, int k) {
    Map<Integer, Integer> remCount = new HashMap<>();
    remCount.put(0, 1);
    int sum = 0, ans = 0;
    for (int x : nums) {
        sum += x;
        int rem = ((sum % k) + k) % k;
        ans += remCount.getOrDefault(rem, 0);
        remCount.merge(rem, 1, Integer::sum);
    }
    return ans;
}
```

## Key Takeaways
- Same skeleton as *Subarray Sum Equals K*, but keyed on `sum % k` instead of the raw
  sum — a repeated remainder signals a subarray divisible by `k`.
- LC 523 needs the map's **first** index per remainder (maximizes subarray length for
  the `>= 2` check); LC 974 needs a **count** per remainder (to tally every pair). Same
  map, different payload — recognize which one the problem is asking for.
- Normalize negative remainders with `((sum % k) + k) % k` — a classic Java trap since
  `%` is a remainder operator, not true modulo, for negative operands.
- Seeding the map (`{0: -1}` or `{0: 1}`) is what lets subarrays starting at index 0 be
  counted correctly, exactly as in *Subarray Sum Equals K*.
