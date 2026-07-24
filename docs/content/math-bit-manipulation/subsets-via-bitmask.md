# Subsets via Bitmask

**Difficulty:** Medium · **Pattern:** enumerate all 2^n bitmasks, each mask's set bits selecting which elements belong to that subset · [LeetCode](https://leetcode.com/problems/subsets/)

## Problem
Given an integer array `nums` of unique elements, return all possible subsets (the power set). The solution set must not contain duplicate subsets; order of subsets and order of elements within each subset do not matter.

## Examples
**Example 1**
```
Input:  nums = [1,2,3]
Output: [[],[1],[2],[1,2],[3],[1,3],[2,3],[1,2,3]]
```

**Example 2**
```
Input:  nums = [0]
Output: [[],[0]]
```

## Constraints
- 1 <= nums.length <= 10
- -10 <= nums[i] <= 10
- All elements of nums are unique.

## Approach 1 — Backtracking (baseline, for contrast)
**Idea.** At each index, branch into "include nums[i]" and "exclude nums[i]", recursing until all indices are decided. This is the classic recursive formulation many students see first; it produces the same 2^n subsets as the bitmask method but via explicit recursion and backtracking of a running list.
**Complexity.** Time O(n * 2^n) (2^n subsets, each up to O(n) to copy), Space O(n) recursion depth.
```java
import java.util.ArrayList;
import java.util.List;

class SolutionBacktracking {
    public List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        backtrack(nums, 0, new ArrayList<>(), result);
        return result;
    }

    private void backtrack(int[] nums, int index, List<Integer> current, List<List<Integer>> result) {
        if (index == nums.length) {
            result.add(new ArrayList<>(current));
            return;
        }
        // exclude nums[index]
        backtrack(nums, index + 1, current, result);
        // include nums[index]
        current.add(nums[index]);
        backtrack(nums, index + 1, current, result);
        current.remove(current.size() - 1);
    }
}
```

## Approach 2 — Bitmask enumeration (optimal, iterative)
**Idea.** Every subset corresponds to a unique n-bit mask from 0 to 2^n - 1: bit `j` of the mask being 1 means `nums[j]` is included. Looping `mask` from 0 to `2^n - 1` and checking each bit directly enumerates the power set without recursion, with a natural, cache-friendly iterative structure.
**Complexity.** Time O(n * 2^n), Space O(1) extra beyond the output.
```java
import java.util.ArrayList;
import java.util.List;

class SolutionBitmask {
    public List<List<Integer>> subsets(int[] nums) {
        int n = nums.length;
        int totalMasks = 1 << n;
        List<List<Integer>> result = new ArrayList<>(totalMasks);

        for (int mask = 0; mask < totalMasks; mask++) {
            List<Integer> subset = new ArrayList<>();
            for (int j = 0; j < n; j++) {
                if ((mask & (1 << j)) != 0) {
                    subset.add(nums[j]);
                }
            }
            result.add(subset);
        }
        return result;
    }
}
```

## Key Takeaways
- Bitmask enumeration and include/exclude backtracking are two views of the same 2^n search space; bitmasks trade recursion for an explicit loop and bit tests.
- `mask & (1 << j)` tests whether element `j` is in the subset represented by `mask` — a core idiom for bitmask DP problems generally (e.g. TSP, assignment DP).
- Iterating masks from 0 to 2^n - 1 conveniently produces subsets in a consistent, reproducible order (mask 0 is the empty set, mask 2^n - 1 is the full set).
- This technique caps out around n <= 20-ish in practice since 2^n growth dominates runtime.
