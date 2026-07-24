# Count of Smaller Numbers After Self

**Difficulty:** Hard · **Pattern:** offline coordinate-compressed Binary Indexed Tree processed right-to-left (also solvable via merge-sort counting inversions) · [LeetCode](https://leetcode.com/problems/count-of-smaller-numbers-after-self/)

## Problem
Given an integer array `nums`, return an array `counts` where `counts[i]` is the number of elements to the right of `nums[i]` that are strictly smaller than `nums[i]`.

## Examples
**Example 1**
```
Input:  nums = [5,2,6,1]
Output: [2,1,1,0]
Explanation: To the right of 5: 2 and 1 are smaller (2). Right of 2: 1 is smaller (1). Right of 6: 1 is smaller (1). Right of 1: nothing (0).
```

**Example 2**
```
Input:  nums = [-1]
Output: [0]
Explanation: Only element, nothing to its right.
```

## Constraints
- 1 <= nums.length <= 10^5
- -10^4 <= nums[i] <= 10^4

## Approach 1 — Brute force nested loop
**Idea.** For each index `i`, scan all indices `j > i` and count how many `nums[j] < nums[i]`.
**Complexity.** Time O(n^2), Space O(n) for the output.
```java
import java.util.*;

class Solution {
    public List<Integer> countSmaller(int[] nums) {
        int n = nums.length;
        List<Integer> result = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int count = 0;
            for (int j = i + 1; j < n; j++) {
                if (nums[j] < nums[i]) count++;
            }
            result.add(count);
        }
        return result;
    }
}
```

## Approach 2 — Coordinate-compressed BIT (Fenwick tree), right to left (optimal)
**Idea.** Compress values to ranks (1-indexed, sorted ascending) so a Binary Indexed Tree can index by rank instead of raw value. Walk the array from right to left: for each `nums[i]`, the answer is the count of previously-inserted elements (i.e., elements to its right, since we go right-to-left) with strictly smaller rank — this is a prefix-sum query on the BIT up to `rank(nums[i]) - 1`. Then insert `nums[i]` into the BIT at its rank. Each query and update is O(log n).
**Complexity.** Time O(n log n), Space O(n) for the BIT and rank map.
```java
import java.util.*;

class Solution {
    private int[] tree;
    private int size;

    public List<Integer> countSmaller(int[] nums) {
        int n = nums.length;
        int[] sorted = nums.clone();
        Arrays.sort(sorted);

        // coordinate compression: value -> 1-indexed rank
        Map<Integer, Integer> rank = new HashMap<>();
        int r = 0;
        for (int v : sorted) {
            if (!rank.containsKey(v)) {
                rank.put(v, ++r);
            }
        }

        size = r;
        tree = new int[size + 1];

        Integer[] result = new Integer[n];
        for (int i = n - 1; i >= 0; i--) {
            int curRank = rank.get(nums[i]);
            result[i] = query(curRank - 1);
            update(curRank, 1);
        }
        return Arrays.asList(result);
    }

    private void update(int index, int delta) {
        for (; index <= size; index += index & (-index)) {
            tree[index] += delta;
        }
    }

    private int query(int index) {
        int sum = 0;
        for (; index > 0; index -= index & (-index)) {
            sum += tree[index];
        }
        return sum;
    }
}
```

## Key Takeaways
- Coordinate compression is essential whenever values span a huge or unbounded range but only their relative order matters — it shrinks the BIT's index space to `O(n)`.
- Processing right to left turns "count smaller elements to the right" into "count smaller elements already inserted," which is exactly a BIT prefix-sum query — a common reformulation for after-this-point counting problems.
- The same problem can be solved via merge sort: count cross-inversions during the merge step, attributing them to the left-array element's original index; both approaches are O(n log n) and worth knowing as alternates.
