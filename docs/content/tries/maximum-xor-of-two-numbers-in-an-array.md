# Maximum XOR of Two Numbers in an Array

**Difficulty:** Medium · **Pattern:** Binary/bitwise trie over 32-bit prefixes, greedily choose the opposite bit at each level · [LeetCode](https://leetcode.com/problems/maximum-xor-of-two-numbers-in-an-array/)

## Problem
Given an integer array `nums`, find the maximum possible value of `nums[i] XOR nums[j]` over all pairs `0 <= i, j < nums.length`.

## Examples
**Example 1**
```
Input:  nums = [3,10,5,25,2,8]
Output: 28
Explanation: The maximum XOR is between 5 (00101) and 25 (11001), giving 11100 = 28.
```

## Constraints
- `1 <= nums.length <= 2 * 10^5`
- `0 <= nums[i] <= 2^31 - 1`

## Approach 1 — Brute force all pairs
**Idea.** Compute the XOR of every pair and track the maximum. Simple and correct but too slow for the upper constraint bound.
**Complexity.** Time O(n^2), Space O(1).
```java
class Solution {
    public int findMaximumXOR(int[] nums) {
        int max = 0;
        for (int i = 0; i < nums.length; i++) {
            for (int j = i + 1; j < nums.length; j++) {
                max = Math.max(max, nums[i] ^ nums[j]);
            }
        }
        return max;
    }
}
```

## Approach 2 — Binary trie over bits, greedy opposite-bit search (optimal)
**Idea.** Insert every number into a binary trie, one node per bit from the most significant (bit 30, since values fit in 31 bits) down to bit 0, each node having at most two children (0 and 1). To maximize XOR for a given number, walk the trie greedily: at each bit position, prefer the child representing the *opposite* bit of the current number (that flips the bit to 1 in the XOR result); if that branch doesn't exist, fall back to the same-bit child. Do this for every number against the shared trie and track the best XOR found. Because all numbers share one trie, insertion and querying are both linear in the bit-width.
**Complexity.** Time O(n · 31), Space O(n · 31) for trie nodes.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[2];
    }

    private static final int BITS = 30; // highest bit index for values < 2^31

    public int findMaximumXOR(int[] nums) {
        TrieNode root = new TrieNode();
        // Insert all numbers first.
        for (int num : nums) insert(root, num);

        int maxXor = 0;
        for (int num : nums) {
            maxXor = Math.max(maxXor, query(root, num));
        }
        return maxXor;
    }

    private void insert(TrieNode root, int num) {
        TrieNode node = root;
        for (int b = BITS; b >= 0; b--) {
            int bit = (num >> b) & 1;
            if (node.children[bit] == null) node.children[bit] = new TrieNode();
            node = node.children[bit];
        }
    }

    private int query(TrieNode root, int num) {
        TrieNode node = root;
        int result = 0;
        for (int b = BITS; b >= 0; b--) {
            int bit = (num >> b) & 1;
            int wanted = 1 - bit; // opposite bit maximizes this position's XOR contribution
            if (node.children[wanted] != null) {
                result |= (1 << b);
                node = node.children[wanted];
            } else {
                node = node.children[bit];
            }
        }
        return result;
    }
}
```

## Key Takeaways
- A bitwise trie built from the most significant bit down lets you greedily pick the "opposite" bit at every level to maximize XOR — this is the canonical technique for max-XOR-pair problems.
- Because both insertion and querying traverse a fixed 31 levels, the whole algorithm is O(n) instead of O(n^2).
- Once the trie is built, only a single pass per number is needed against the *same* shared trie, so build it once, then query for every element.
