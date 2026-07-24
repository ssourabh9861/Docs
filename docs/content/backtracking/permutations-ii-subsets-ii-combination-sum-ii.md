# Permutations II / Subsets II / Combination Sum II

**Difficulty:** Medium · **Pattern:** sort + skip-equal dedup backtracking · [LeetCode](https://leetcode.com/problems/permutations-ii/)

## Problem
Three related "with duplicates" backtracking problems, all solved by **sorting first, then skipping equal siblings** at the same recursion depth:
- **Permutations II**: return all distinct permutations of `nums` (which may contain duplicates).
- **Subsets II**: return all distinct subsets (the power set) of `nums` (which may contain duplicates).
- **Combination Sum II**: return all distinct combinations from `candidates` (each element usable at most once) that sum to `target`.

## Examples
**Example 1 (Permutations II)**
```
Input:  nums = [1,1,2]
Output: [[1,1,2],[1,2,1],[2,1,1]]
Explanation: Without dedup, [1,1,2] would appear twice (from the two 1's); skip-equal pruning removes the duplicate.
```
**Example 2 (Subsets II)**
```
Input:  nums = [1,2,2]
Output: [[],[1],[1,2],[1,2,2],[2],[2,2]]
Explanation: The two 2's would otherwise produce duplicate subsets like [2] twice.
```
**Example 3 (Combination Sum II)**
```
Input:  candidates = [10,1,2,7,6,1,5], target = 8
Output: [[1,1,6],[1,2,5],[1,7],[2,6]]
Explanation: Each candidate used at most once; sorting groups the duplicate 1's so only the first at each depth starts a new branch.
```

## Constraints
- Permutations II: `1 <= nums.length <= 8`
- Subsets II: `1 <= nums.length <= 10`
- Combination Sum II: `1 <= candidates.length <= 100`, `1 <= candidates[i] <= 50`, `1 <= target <= 30`

## Approach 1 — Sort + skip-equal backtracking (all three, unified pattern)
**Idea.** In every variant: **sort `nums`/`candidates` first** so duplicate values become adjacent. Then during the DFS, at each recursion depth, iterate candidates left to right and add the rule *"skip index `i` if `i` is not the first choice at this depth AND `nums[i] == nums[i-1]`"*. This precisely allows the first occurrence of a repeated value to start a new branch while forbidding subsequent equal values from re-deriving the same branch — i.e., `choose` the element, `explore` deeper, `un-choose` (remove it / mark unused) before trying the next distinct value.
- **Subsets II**: at each depth, loop from the current start index; skip `i > start && nums[i] == nums[i-1]`. Every recursive call itself is a valid subset (record it on entry).
- **Combination Sum II**: identical loop/skip rule, but also prune when `candidates[i] > remaining` (sorted array lets you `break` instead of `continue`), and each element can be used once so recurse from `i + 1`.
- **Permutations II**: use a `used[]` boolean array instead of a start index (all elements can be revisited in any position); skip `i` if `nums[i] == nums[i-1] && !used[i-1]` — the `!used[i-1]` condition ensures only one "branch order" per group of equal values is explored per depth.

**Complexity.** Time O(2^n · n) for Subsets II, O(2^n · n) for Combination Sum II, O(n! ) for Permutations II (all with pruning cutting the practical constant significantly); Space O(n) recursion + O(n) per output combination.
```java
import java.util.*;

class Solution {

    // ---------- Subsets II ----------
    public List<List<Integer>> subsetsWithDup(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> result = new ArrayList<>();
        backtrackSubsets(nums, 0, new ArrayDeque<>(), result);
        return result;
    }

    private void backtrackSubsets(int[] nums, int start, Deque<Integer> path, List<List<Integer>> result) {
        result.add(new ArrayList<>(path)); // every node is a valid subset
        for (int i = start; i < nums.length; i++) {
            if (i > start && nums[i] == nums[i - 1]) continue; // skip-equal sibling
            path.addLast(nums[i]);            // choose
            backtrackSubsets(nums, i + 1, path, result); // explore
            path.removeLast();                // un-choose
        }
    }

    // ---------- Combination Sum II ----------
    public List<List<Integer>> combinationSum2(int[] candidates, int target) {
        Arrays.sort(candidates);
        List<List<Integer>> result = new ArrayList<>();
        backtrackCombo(candidates, target, 0, new ArrayDeque<>(), result);
        return result;
    }

    private void backtrackCombo(int[] cand, int remaining, int start, Deque<Integer> path, List<List<Integer>> result) {
        if (remaining == 0) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = start; i < cand.length; i++) {
            if (i > start && cand[i] == cand[i - 1]) continue; // skip-equal sibling
            if (cand[i] > remaining) break;                     // prune: sorted, so all later are bigger too
            path.addLast(cand[i]);                    // choose
            backtrackCombo(cand, remaining - cand[i], i + 1, path, result); // explore
            path.removeLast();                        // un-choose
        }
    }

    // ---------- Permutations II ----------
    public List<List<Integer>> permuteUnique(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> result = new ArrayList<>();
        boolean[] used = new boolean[nums.length];
        backtrackPermute(nums, used, new ArrayDeque<>(), result);
        return result;
    }

    private void backtrackPermute(int[] nums, boolean[] used, Deque<Integer> path, List<List<Integer>> result) {
        if (path.size() == nums.length) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            if (i > 0 && nums[i] == nums[i - 1] && !used[i - 1]) continue; // skip-equal sibling
            used[i] = true;
            path.addLast(nums[i]);          // choose
            backtrackPermute(nums, used, path, result); // explore
            path.removeLast();              // un-choose
            used[i] = false;
        }
    }
}
```

## Approach 2 — Frequency-map backtracking (optimal / pruned variant)
**Idea.** For heavily-duplicated inputs, an alternative to sort+skip is to backtrack over a `count` map of distinct value -> remaining occurrences. At each depth you iterate **distinct keys only** (never revisiting the same value twice at one depth), decrement the count when chosen, recurse, then restore the count — this eliminates the `nums[i]==nums[i-1]` bookkeeping entirely because duplicates are collapsed structurally rather than skipped procedurally. Shown here for Permutations II, the same idea applies directly to Subsets II (loop distinct keys, choose 0..count copies) and Combination Sum II (loop distinct keys with remaining-sum pruning).
**Complexity.** Time O(n! / (∏ dup!)) — proportional to the true number of distinct permutations, Space O(n) for the map + recursion.
```java
import java.util.*;

class Solution {
    public List<List<Integer>> permuteUnique(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        Map<Integer, Integer> count = new TreeMap<>();
        for (int num : nums) count.merge(num, 1, Integer::sum);
        backtrack(count, nums.length, new ArrayDeque<>(), result);
        return result;
    }

    private void backtrack(Map<Integer, Integer> count, int remainingSlots,
                            Deque<Integer> path, List<List<Integer>> result) {
        if (remainingSlots == 0) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (Map.Entry<Integer, Integer> entry : count.entrySet()) {
            int value = entry.getKey();
            if (entry.getValue() == 0) continue; // prune: exhausted this value
            entry.setValue(entry.getValue() - 1); // choose
            path.addLast(value);
            backtrack(count, remainingSlots - 1, path, result); // explore
            path.removeLast();                    // un-choose
            entry.setValue(entry.getValue() + 1);
        }
    }
}
```

## Key Takeaways
- The universal fix for duplicate-input backtracking is **sort, then at each recursion depth allow only the first occurrence of a repeated value to branch** — implemented as `i > start && nums[i] == nums[i-1]` for combination/subset-style (index-advancing) search, or `nums[i] == nums[i-1] && !used[i-1]` for permutation-style (all-positions) search.
- Subsets II records every node of the recursion tree as an answer; Combination Sum II records only leaves where `remaining == 0`; Permutations II records only leaves where the path is full length — the skip-equal rule is the same, but *when* you record differs.
- Combination Sum II can `break` instead of `continue` once `candidates[i] > remaining` because the array is sorted — a small but important pruning upgrade over a plain `continue`.
- The frequency-map variant is a good follow-up answer when asked "what if there are many duplicates" — it turns the practical runtime from "prune many duplicate branches" into "there are no duplicate branches to begin with."
