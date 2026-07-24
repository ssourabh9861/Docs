# Find K-th Smallest Pair Distance

**Difficulty:** Hard · **Pattern:** Binary search on the answer (feasibility predicate = count of pairs) · [LeetCode](https://leetcode.com/problems/find-k-th-smallest-pair-distance/)

## Problem
Given an integer array `nums` and an integer `k`, return the `k`-th smallest distance among all pairs `(i, j)` with `i < j`, where distance is `|nums[i] - nums[j]|`.

## Examples
**Example 1**
```
Input:  nums = [1,3,1], k = 1
Output: 0
Explanation: Pairs and distances: (1,3)->2, (1,1)->0, (3,1)->2. Sorted: [0,2,2]. 1st smallest = 0.
```
**Example 2**
```
Input:  nums = [1,1,1], k = 2
Output: 0
Explanation: All pairwise distances are 0.
```

## Constraints
- `n == nums.length`
- `2 <= n <= 10^4`
- `0 <= nums[i] <= 10^6`
- `1 <= k <= n * (n - 1) / 2`

## Approach 1 — Generate all distances and sort
**Idea.** Compute all `n*(n-1)/2` pairwise distances, sort them, and pick the `k`-th smallest.
**Complexity.** Time O(n^2 log n), Space O(n^2). Infeasible for `n = 10^4` (~5*10^7 pairs).
```java
class Solution {
    public int smallestDistancePair(int[] nums, int k) {
        int n = nums.length;
        List<Integer> distances = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                distances.add(Math.abs(nums[i] - nums[j]));
            }
        }
        Collections.sort(distances);
        return distances.get(k - 1);
    }
}
```

## Approach 2 — Binary search on the answer + two pointers (optimal)
**Idea.** Sort `nums`. Binary search the candidate distance `mid` over `[0, max - min]`. **Predicate/count function** `countPairsWithDistanceAtMost(mid)`: for each right index `j`, use a sliding left pointer to count how many `i < j` satisfy `nums[j] - nums[i] <= mid` — since the array is sorted, this count is computable in O(n) total via two pointers (the window only moves forward). This count is monotonically non-decreasing in `mid`, so binary search for the smallest `mid` where `count(mid) >= k` — that `mid` is guaranteed to be an actual pairwise distance because the count only changes at values that are real distances.
**Complexity.** Time O(n log n) to sort + O(n log(max-min)) for the search, Space O(1) extra (excluding sort).
```java
class Solution {
    public int smallestDistancePair(int[] nums, int k) {
        Arrays.sort(nums);
        int n = nums.length;
        int lo = 0, hi = nums[n - 1] - nums[0];

        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (countPairsWithDistanceAtMost(nums, mid) >= k) {
                hi = mid;       // enough pairs within mid, try smaller distance
            } else {
                lo = mid + 1;   // not enough pairs, need a larger distance
            }
        }
        return lo;
    }

    // count pairs (i, j), i < j, with nums[j] - nums[i] <= maxDist
    private int countPairsWithDistanceAtMost(int[] nums, int maxDist) {
        int count = 0, left = 0;
        for (int right = 0; right < nums.length; right++) {
            while (nums[right] - nums[left] > maxDist) left++;
            count += right - left;
        }
        return count;
    }
}
```

## Key Takeaways
- The predicate here is a **count**, not a boolean — binary search for the smallest value whose "count of pairs `<=` it" reaches `k`. This "count-based" binary search is a recurring sub-pattern (also used in Kth Smallest Element in a Sorted Matrix).
- Sorting first is what makes the O(n) two-pointer count possible per binary-search step — always sort before this kind of distance/count predicate.
- Search bounds are `[0, max(nums) - min(nums)]`, the range of possible distances.
- Related: Kth Smallest Element in a Sorted Matrix (count-based binary search on value), Median of Two Sorted Arrays (different, index-based binary search).
