# Find K Pairs with Smallest Sums

**Difficulty:** Hard · **Pattern:** k-pointers-in-heap — min-heap seeded with pairs, expand one index per pop · [LeetCode](https://leetcode.com/problems/find-k-pairs-with-smallest-sums/)

## Problem
Given two sorted integer arrays `nums1` and `nums2` and an integer `k`, return the `k` pairs `(u, v)` with `u` from `nums1` and `v` from `nums2` that have the smallest sums.

## Examples
**Example 1**
```
Input:  nums1 = [1,7,11], nums2 = [2,4,6], k = 3
Output: [[1,2],[1,4],[1,6]]
Explanation: The 3 smallest sums are 1+2=3, 1+4=5, 1+6=7.
```

## Constraints
- 1 <= nums1.length, nums2.length <= 10^5
- -10^9 <= nums1[i], nums2[i] <= 10^9
- nums1 and nums2 are sorted in ascending order
- 1 <= k <= 10^4

## Approach 1 — Generate all pairs, sort
**Idea.** Compute every pair's sum, sort all pairs by sum, and take the first `k`. Straightforward but wasteful when the arrays are large and `k` is small.
**Complexity.** Time O(m * n log(m * n)), Space O(m * n).
```java
import java.util.*;

class Solution {
    public List<List<Integer>> kSmallestPairs(int[] nums1, int[] nums2, int k) {
        List<int[]> all = new ArrayList<>();
        for (int u : nums1) {
            for (int v : nums2) {
                all.add(new int[]{u, v});
            }
        }
        all.sort((a, b) -> (a[0] + a[1]) - (b[0] + b[1]));

        List<List<Integer>> result = new ArrayList<>();
        for (int i = 0; i < Math.min(k, all.size()); i++) {
            result.add(Arrays.asList(all.get(i)[0], all.get(i)[1]));
        }
        return result;
    }
}
```

## Approach 2 — Min-heap seeded with (i, 0), expand j (optimal)
**Idea.** Because both arrays are sorted, the smallest possible sum for each `nums1[i]` is paired with `nums2[0]`. Seed a min-heap (ordered by sum) with pairs `(nums1[i], nums2[0])` for the first `min(m, k)` indices `i` — no need to seed more than k since we'll never need more than k results. Each time we pop a pair `(i, j)`, we push its successor `(i, j+1)` (same `i`, next `j`) if it's in bounds, since that's the next-smallest candidate reachable from row `i`. Stop after collecting `k` pairs.
**Complexity.** Time O(k log(min(m, k))), Space O(min(m, k)).
```java
import java.util.*;

class Solution {
    public List<List<Integer>> kSmallestPairs(int[] nums1, int[] nums2, int k) {
        List<List<Integer>> result = new ArrayList<>();
        if (nums1.length == 0 || nums2.length == 0 || k == 0) return result;

        // heap entries: [sum, i, j] meaning pair (nums1[i], nums2[j])
        PriorityQueue<int[]> heap = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));

        int m = nums1.length;
        int seedCount = Math.min(m, k);
        for (int i = 0; i < seedCount; i++) {
            heap.offer(new int[]{nums1[i] + nums2[0], i, 0});
        }

        while (k > 0 && !heap.isEmpty()) {
            int[] curr = heap.poll();
            int i = curr[1], j = curr[2];
            result.add(Arrays.asList(nums1[i], nums2[j]));
            k--;

            if (j + 1 < nums2.length) {
                heap.offer(new int[]{nums1[i] + nums2[j + 1], i, j + 1});
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Only seed the heap with `min(m, k)` starting pairs — seeding all of `nums1` is wasted work once k is much smaller than m.
- The "expand along one axis, push the successor" trick works because sortedness guarantees the next-smallest reachable pair from row `i` is exactly `(i, j+1)`.
- This is the same k-pointers-in-heap skeleton used in Smallest Range Covering Elements from K Lists and Kth Smallest Element in a Sorted Matrix.
