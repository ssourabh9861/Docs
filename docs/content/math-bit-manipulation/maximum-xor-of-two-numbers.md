# Maximum XOR of Two Numbers in an Array

**Difficulty:** Medium · **Pattern:** greedy bit-by-bit construction verified with a prefix HashSet, or a bitwise prefix trie · [LeetCode](https://leetcode.com/problems/maximum-xor-of-two-numbers-in-an-array/)

## Problem
Given an integer array `nums`, find the maximum possible value of `nums[i] XOR nums[j]` over all pairs `i != j`.

## Examples
**Example 1**
```
Input:  nums = [3,10,5,25,2,8]
Output: 28
Explanation: 5 XOR 25 = 28.
```

**Example 2**
```
Input:  nums = [14,70,53,83,49,91,36,80,92,51,66,70]
Output: 127
```

## Constraints
- 1 <= nums.length <= 2 * 10^5
- 0 <= nums[i] <= 2^31 - 1

## Approach 1 — Greedy prefix building with a HashSet
**Idea.** Build the answer bit by bit from the most significant bit (bit 30 suffices since values fit in 31 bits) to the least. Maintain `answer` as the best prefix found so far. At each step, tentatively set the candidate bit: `candidate = answer | (1 << bit)`. Put every number's prefix (top bits down to current bit) into a HashSet, then check whether any two prefixes `p1, p2` in the set satisfy `p1 ^ p2 == candidate` — equivalently, for each prefix `p`, test if `candidate ^ p` is also in the set. If so, that bit can be achieved, so keep it in `answer`; otherwise discard the bit for this position.
**Complexity.** Time O(32n), Space O(n).
```java
import java.util.HashSet;
import java.util.Set;

class SolutionGreedy {
    public int findMaximumXOR(int[] nums) {
        int maxXor = 0, mask = 0;
        for (int bit = 30; bit >= 0; bit--) {
            mask |= (1 << bit);
            Set<Integer> prefixes = new HashSet<>();
            for (int num : nums) {
                prefixes.add(num & mask);
            }
            int candidate = maxXor | (1 << bit);
            for (int prefix : prefixes) {
                if (prefixes.contains(candidate ^ prefix)) {
                    maxXor = candidate;
                    break;
                }
            }
        }
        return maxXor;
    }
}
```

## Approach 2 — Bitwise prefix trie (optimal, single pass insert + query)
**Idea.** Insert every number into a binary trie, one bit at a time from MSB to LSB (31 levels). Then, for each number, walk the trie greedily trying to go the *opposite* bit at each level (to maximize that bit's XOR contribution); fall back to the same-bit child only if the opposite doesn't exist. Accumulate the resulting XOR value and track the maximum across all numbers. Insertion and querying can be interleaved in one pass so each number is XORed against all trie entries inserted so far, but querying against the fully-built trie for every number is simpler and equally correct since XOR is symmetric.
**Complexity.** Time O(32n) for build + O(32n) for query = O(n), Space O(32n) trie nodes.
```java
class SolutionTrie {
    private static final int BITS = 31;

    class TrieNode {
        TrieNode[] children = new TrieNode[2];
    }

    private TrieNode root = new TrieNode();

    private void insert(int num) {
        TrieNode node = root;
        for (int bit = BITS - 1; bit >= 0; bit--) {
            int b = (num >> bit) & 1;
            if (node.children[b] == null) node.children[b] = new TrieNode();
            node = node.children[b];
        }
    }

    private int queryMax(int num) {
        TrieNode node = root;
        int result = 0;
        for (int bit = BITS - 1; bit >= 0; bit--) {
            int b = (num >> bit) & 1;
            int want = 1 - b;
            if (node.children[want] != null) {
                result |= (1 << bit);
                node = node.children[want];
            } else {
                node = node.children[b];
            }
        }
        return result;
    }

    public int findMaximumXOR(int[] nums) {
        for (int num : nums) insert(num);
        int maxXor = 0;
        for (int num : nums) {
            maxXor = Math.max(maxXor, queryMax(num));
        }
        return maxXor;
    }
}
```

## Key Takeaways
- Building the answer greedily from MSB to LSB works because higher bits dominate the value — commit to a bit only if it's provably achievable.
- The HashSet trick reduces "does some pair achieve this XOR prefix" to a simple set-membership check per candidate.
- A prefix trie makes the "find the number that maximizes XOR with x" query natural: always try to branch to the opposite bit.
- Both approaches run in O(n) with a constant 30-32 factor from the bit width, far better than the O(n^2) brute force of checking every pair.
