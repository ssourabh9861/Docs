# Count Pairs With XOR in a Range

**Difficulty:** Very Hard · **Pattern:** Binary trie with subtree counts, answer via countLessThan(high+1) - countLessThan(low) using a "count numbers giving XOR < limit" trie walk · [LeetCode](https://leetcode.com/problems/count-pairs-with-xor-in-a-range/)

## Problem
Given an integer array `nums` and two integers `low` and `high`, return the number of pairs `(i, j)` with `i < j` such that `low <= (nums[i] XOR nums[j]) <= high`.

## Examples
**Example 1**
```
Input:  nums = [1,4,2,7], low = 2, high = 6
Output: 6
Explanation: All pairs (i,j) with i<j: (1,4)=5, (1,2)=3, (1,7)=6, (4,2)=6, (4,7)=3, (2,7)=5.
             All six XOR values (5,3,6,6,3,5) fall within [2,6].
```

## Constraints
- `1 <= nums.length <= 2 * 10^4`
- `1 <= nums[i] <= 2 * 10^4`
- `1 <= low <= high <= 2 * 10^4`

## Approach 1 — Brute force all pairs
**Idea.** Check every pair `(i, j)` with `i < j`, compute the XOR, and count it if it falls in `[low, high]`. Simple and correct but quadratic.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int countPairs(int[] nums, int low, int high) {
        int count = 0;
        int n = nums.length;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                int x = nums[i] ^ nums[j];
                if (x >= low && x <= high) count++;
            }
        }
        return count;
    }
}
```

## Approach 2 — Binary trie with subtree counts, "count XOR < limit" trick (optimal)
**Idea.** Reduce the range condition to two prefix counts:
`countPairs(low, high) = countPairsLessThan(high + 1) - countPairsLessThan(low)`,
where `countPairsLessThan(limit)` counts pairs whose XOR is strictly less than `limit`.

Build the answer incrementally: maintain a binary trie of the numbers processed so far (inserted one at a time, each node tracking how many numbers pass through it, i.e., a subtree count). For each new number `num`, before inserting it, query how many already-inserted numbers XOR with `num` to something `< limit`. This query walks the trie **bit by bit alongside both `num` and `limit`**: at each bit position, let `numBit` be `num`'s bit and `limitBit` be `limit`'s bit.
- If `limitBit == 1`: choosing the trie child equal to `numBit` (same bit) makes this position's XOR bit `0`, which is *already* `< limitBit` at this position, so *all* numbers in that subtree (its count) satisfy XOR `< limit` regardless of lower bits — add that subtree's count to the answer. Then continue the walk into the *opposite* child (XOR bit `1`, matching `limitBit`) to keep checking equality-so-far paths for further contributions from lower bits.
- If `limitBit == 0`: the XOR bit must be `0` too (an XOR bit of `1` would already exceed `limit` at this position), so only continue into the child equal to `numBit` (same bit) with no count added yet; if that child doesn't exist, stop (no more contributions).
Sum the counts added at each step; that's `countPairsLessThan(limit)` restricted to numbers already inserted. Process numbers one at a time: for each number, first query against the trie built from previous numbers (giving all pairs `(earlier, current)`), then insert the current number. Summing over all numbers gives the total count for that limit; run this whole incremental process twice (once for `high + 1`, once for `low`) and subtract.
**Complexity.** Time O(n · 16) per full pass (16 ~ bit-width for values up to 2*10^4 < 2^15, use 17 bits to be safe), so O(n · 17) for both passes combined = O(n). Space O(n · 17) for trie nodes.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[2];
        int count = 0; // how many numbers pass through this node
    }

    private static final int BITS = 16; // covers values up to 2*10^4 < 2^15, plus headroom

    public int countPairs(int[] nums, int low, int high) {
        return countPairsLessThan(nums, high + 1) - countPairsLessThan(nums, low);
    }

    private int countPairsLessThan(int[] nums, int limit) {
        if (limit <= 0) return 0;
        TrieNode root = new TrieNode();
        int total = 0;
        for (int num : nums) {
            total += queryLessThan(root, num, limit);
            insert(root, num);
        }
        return total;
    }

    private void insert(TrieNode root, int num) {
        TrieNode node = root;
        for (int b = BITS; b >= 0; b--) {
            int bit = (num >> b) & 1;
            if (node.children[bit] == null) node.children[bit] = new TrieNode();
            node = node.children[bit];
            node.count++;
        }
    }

    // Count how many previously-inserted numbers x satisfy (num ^ x) < limit.
    private int queryLessThan(TrieNode root, int num, int limit) {
        TrieNode node = root;
        int result = 0;
        for (int b = BITS; b >= 0 && node != null; b--) {
            int numBit = (num >> b) & 1;
            int limitBit = (limit >> b) & 1;
            if (limitBit == 1) {
                // Same-bit child gives XOR bit 0 at this position -> already < limit for all its subtree
                TrieNode sameBitChild = node.children[numBit];
                if (sameBitChild != null) result += sameBitChild.count;
                // Continue only through the opposite-bit child (XOR bit 1, matching limitBit) to stay on the equality frontier
                node = node.children[1 - numBit];
            } else {
                // limitBit == 0: XOR bit must be 0 too, so only continue same-bit child, no count added yet
                node = node.children[numBit];
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Range-count problems ("XOR in `[low, high]`") reduce to two "count strictly less than" queries: `countLessThan(high+1) - countLessThan(low)`.
- The bitwise trie stores a running population count at each node so a "less than limit" query can add whole-subtree counts in O(bit-width) instead of enumerating pairs.
- The core trick: when the limit's current bit is `1`, any number producing XOR bit `0` here is automatically within range for all its remaining bits, so add that subtree wholesale and only keep walking down the branch that keeps XOR matching the limit's bits exactly (the "tight" path); when the limit's bit is `0`, there is no wholesale win, so only continue the branch producing XOR bit `0`.
