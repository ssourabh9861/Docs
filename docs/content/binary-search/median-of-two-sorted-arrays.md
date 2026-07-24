# Median of Two Sorted Arrays

**Difficulty:** Hard · **Pattern:** Binary search on partition index (index binary search) · [LeetCode](https://leetcode.com/problems/median-of-two-sorted-arrays/)

## Problem
Given two sorted arrays `nums1` and `nums2` of sizes `m` and `n`, find the median of the two arrays combined, in `O(log(min(m, n)))` time.

## Examples
**Example 1**
```
Input:  nums1 = [1,3], nums2 = [2]
Output: 2.0
Explanation: merged = [1,2,3], median = 2
```
**Example 2**
```
Input:  nums1 = [1,2], nums2 = [3,4]
Output: 2.5
Explanation: merged = [1,2,3,4], median = (2+3)/2
```

## Constraints
- `0 <= m, n <= 1000`, `1 <= m + n <= 2000`
- `-10^6 <= nums1[i], nums2[i] <= 10^6`
- Both arrays are sorted in non-decreasing order.

## Approach 1 — Merge and pick middle
**Idea.** Merge both sorted arrays with a two-pointer walk and read off the middle element(s). Correct but ignores the log-time requirement.
**Complexity.** Time O(m + n), Space O(m + n).
```java
class Solution {
    public double findMedianSortedArrays(int[] nums1, int[] nums2) {
        int m = nums1.length, n = nums2.length;
        int[] merged = new int[m + n];
        int i = 0, j = 0, k = 0;
        while (i < m && j < n) merged[k++] = nums1[i] <= nums2[j] ? nums1[i++] : nums2[j++];
        while (i < m) merged[k++] = nums1[i++];
        while (j < n) merged[k++] = nums2[j++];
        int total = m + n;
        if (total % 2 == 1) return merged[total / 2];
        return (merged[total / 2 - 1] + merged[total / 2]) / 2.0;
    }
}
```

## Approach 2 — Binary search on the partition (optimal)
**Idea.** Binary search over the smaller array to find a partition index `i` (0..m) such that the corresponding partition `j = (m+n+1)/2 - i` in the other array splits the *combined* elements into a left half and right half of (near-)equal size, with every left element <= every right element. The **predicate** we binary search on: `maxLeftX <= minRightY && maxLeftY <= minRightX`. Because both arrays are sorted, as `i` increases, `maxLeftX` increases and `minRightX` increases monotonically — this makes the "is partition valid / too far left / too far right" check monotonic, letting standard binary search converge. If `maxLeftX > minRightY`, `i` is too big → move left; otherwise move right.
**Complexity.** Time O(log(min(m, n))), Space O(1).
```java
class Solution {
    public double findMedianSortedArrays(int[] A, int[] B) {
        if (A.length > B.length) return findMedianSortedArrays(B, A); // ensure A is smaller
        int m = A.length, n = B.length;
        int lo = 0, hi = m, half = (m + n + 1) / 2;
        while (lo <= hi) {
            int i = (lo + hi) / 2;      // partition in A
            int j = half - i;          // partition in B

            int maxLeftA = (i == 0) ? Integer.MIN_VALUE : A[i - 1];
            int minRightA = (i == m) ? Integer.MAX_VALUE : A[i];
            int maxLeftB = (j == 0) ? Integer.MIN_VALUE : B[j - 1];
            int minRightB = (j == n) ? Integer.MAX_VALUE : B[j];

            if (maxLeftA <= minRightB && maxLeftB <= minRightA) {
                if ((m + n) % 2 == 1) return Math.max(maxLeftA, maxLeftB);
                return (Math.max(maxLeftA, maxLeftB) + Math.min(minRightA, minRightB)) / 2.0;
            } else if (maxLeftA > minRightB) {
                hi = i - 1; // too far right in A
            } else {
                lo = i + 1; // too far left in A
            }
        }
        throw new IllegalArgumentException("Input arrays are not sorted");
    }
}
```

## Key Takeaways
- Binary search the *smaller* array's cut point, not the value — this is index binary search, not search-on-answer.
- The valid-partition predicate (`maxLeftA <= minRightB && maxLeftB <= minRightA`) is monotonic in `i`, which is exactly what licenses binary search here.
- Handle empty-partition sentinels (`MIN_VALUE`/`MAX_VALUE`) carefully — the most common source of bugs.
- Related: Kth Smallest Element in a Sorted Matrix, Find K-th Smallest Pair Distance (both binary-search-on-answer variants of "find the k-th thing across two sorted structures").
