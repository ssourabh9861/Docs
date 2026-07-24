# Count of Range Sum

**Difficulty:** Hard · **Pattern:** Prefix sum + merge-sort counting · [LeetCode #327](https://leetcode.com/problems/count-of-range-sum/)

## Problem

Given an integer array `nums` and two integers `lower` and `upper`, return the number
of range sums `S(i, j) = nums[i] + ... + nums[j]` (`i <= j`) that lie inside
`[lower, upper]` inclusive.

## Examples

**Example 1**
```
Input:  nums = [-2,5,-1], lower = -2, upper = 2
Output: 3
Explanation: The ranges are [0,0], [2,2], [0,2] with sums -2, -1, 2 — all within [-2,2].
```

**Example 2**
```
Input:  nums = [0], lower = 0, upper = 0
Output: 1
```

## Constraints
- `1 <= nums.length <= 10^5`
- `-2^31 <= nums[i] <= 2^31 - 1`
- `-10^5 <= lower <= upper <= 10^5`
- Cumulative sums can overflow `int` — accumulate in `long`.

## Approach 1 — Brute force with prefix sums

**Idea.** Build `prefix[i]` = sum of the first `i` elements (`prefix[0] = 0`), so
`S(i, j) = prefix[j+1] - prefix[i]`. Check every pair.

**Complexity.** Time `O(n²)`, Space `O(n)`.

```java
public int countRangeSum(int[] nums, int lower, int upper) {
    int n = nums.length;
    long[] prefix = new long[n + 1];
    for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];

    int count = 0;
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j <= n; j++) {
            long sum = prefix[j] - prefix[i];
            if (sum >= lower && sum <= upper) count++;
        }
    }
    return count;
}
```

## Approach 2 — Merge-sort counting on prefix sums (optimal)

**Idea.** The condition `S(i, j) ∈ [lower, upper]` is equivalent to
`prefix[i] ∈ [prefix[j] - upper, prefix[j] - lower]` for `i < j`. Unlike *Subarray Sum
Equals K*, this is a **range** condition, not equality, so a hashmap can't answer it in
`O(1)` — we need order statistics. Use a divide-and-conquer merge sort over the prefix
array: recursively sort+count the left half and right half, then, while both halves are
still individually sorted (before merging), slide two pointers across the right half for
each left-half prefix to count how many right-half prefixes fall in its target window.
Finally merge the two sorted halves (classic merge-sort counting, same shape as
*Count of Smaller Numbers After Self*).

**Complexity.** Time `O(n log n)`, Space `O(n)`.

```java
public int countRangeSum(int[] nums, int lower, int upper) {
    int n = nums.length;
    long[] prefix = new long[n + 1];
    for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];
    return mergeCount(prefix, 0, n, lower, upper);
}

private int mergeCount(long[] prefix, int lo, int hi, int lower, int upper) {
    if (hi - lo <= 1) return 0;
    int mid = lo + (hi - lo) / 2;
    int count = mergeCount(prefix, lo, mid, lower, upper)
              + mergeCount(prefix, mid, hi, lower, upper);

    // For each prefix[i] in the left half, count prefix[j] in the right half
    // with prefix[j] - prefix[i] in [lower, upper]. Both halves are sorted here.
    int lo2 = mid, hi2 = mid;
    for (int i = lo; i < mid; i++) {
        while (lo2 < hi && prefix[lo2] - prefix[i] < lower) lo2++;
        while (hi2 < hi && prefix[hi2] - prefix[i] <= upper) hi2++;
        count += hi2 - lo2;
    }

    long[] merged = new long[hi - lo];
    int p1 = lo, p2 = mid, idx = 0;
    while (p1 < mid && p2 < hi) merged[idx++] = prefix[p1] <= prefix[p2] ? prefix[p1++] : prefix[p2++];
    while (p1 < mid) merged[idx++] = prefix[p1++];
    while (p2 < hi) merged[idx++] = prefix[p2++];
    System.arraycopy(merged, 0, prefix, lo, merged.length);

    return count;
}
```

## Key Takeaways
- Reduces to counting index pairs `(i, j)` with `prefix[j] - prefix[i]` in a range —
  the same prefix-sum reduction as *Subarray Sum Equals K*, but a range query instead of
  equality means a hashmap doesn't suffice; you need a structure with order (merge sort,
  BIT/Fenwick tree with coordinate compression, or a balanced BST).
- The two-pointer sweep works only because each half is individually sorted at that
  point in the recursion — merge *after* counting, not before.
- Sibling problems solved with the exact same merge-sort-counting skeleton: *Count of
  Smaller Numbers After Self*, *Reverse Pairs*.
