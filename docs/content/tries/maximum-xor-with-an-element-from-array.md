# Maximum XOR With an Element From Array

**Difficulty:** Hard · **Pattern:** Offline queries sorted by limit + incrementally built binary trie, greedy opposite-bit search · [LeetCode](https://leetcode.com/problems/maximum-xor-with-an-element-from-array/)

## Problem
Given an array `nums` and queries `[xi, mi]`, for each query find the maximum XOR of `xi` with any element of `nums` that is `<= mi`; if no such element exists, the answer is `-1`.

## Examples
**Example 1**
```
Input:  nums = [0,1,2,3,4], queries = [[3,1],[1,3],[5,6]]
Output: [3,3,7]
Explanation: For [3,1]: only 0 or 1 qualify (<=1); max(3^0, 3^1) = 3^0 = 3.
             For [1,3]: elements <=3 are {0,1,2,3}; max XOR with 1 is 1^2=3.
             For [5,6]: all elements qualify; max XOR with 5 is 5^2=7.
```

## Constraints
- `1 <= nums.length, queries.length <= 10^5`
- `queries[i].length == 2`
- `0 <= nums[j], xi, mi <= 10^9`

## Approach 1 — Brute force per query
**Idea.** For each query, filter `nums` down to values `<= mi`, then linearly XOR each against `xi` and take the max. Correct but quadratic in the worst case.
**Complexity.** Time O(Q · n), Space O(1) extra.
```java
class Solution {
    public int[] maximizeXor(int[] nums, int[][] queries) {
        int[] ans = new int[queries.length];
        for (int i = 0; i < queries.length; i++) {
            int x = queries[i][0], m = queries[i][1];
            int best = -1;
            for (int num : nums) {
                if (num <= m) best = Math.max(best, num ^ x);
            }
            ans[i] = best;
        }
        return ans;
    }
}
```

## Approach 2 — Sort nums and queries by limit, build trie incrementally (optimal)
**Idea.** Sort `nums` ascending. Sort query indices by their limit `mi` ascending. Process queries in that order, maintaining a pointer into the sorted `nums`: before answering a query, insert every number `<= mi` (that hasn't been inserted yet) into a binary trie. This way each query only ever sees exactly the eligible subset in the trie. Then answer the query with the same greedy "prefer opposite bit" walk as the standard max-XOR trie search. If the trie is still empty when a query is processed (no eligible numbers), answer `-1`. Because both nums and queries are scanned only once in sorted order, this is the offline sweep technique that avoids rebuilding the trie from scratch per query.
**Complexity.** Time O((n + Q) log(n + Q) + (n + Q) · 30), Space O(n · 30) for the trie.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[2];
    }

    private static final int BITS = 29; // nums, xi <= 10^9 < 2^30

    private TrieNode root = new TrieNode();

    public int[] maximizeXor(int[] nums, int[][] queries) {
        Arrays.sort(nums);
        int q = queries.length;
        Integer[] order = new Integer[q];
        for (int i = 0; i < q; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> queries[a][1] - queries[b][1]);

        int[] ans = new int[q];
        int ptr = 0;
        boolean anyInserted = false;

        for (int idx : order) {
            int x = queries[idx][0], m = queries[idx][1];
            while (ptr < nums.length && nums[ptr] <= m) {
                insert(nums[ptr]);
                ptr++;
                anyInserted = true;
            }
            ans[idx] = anyInserted ? query(x) : -1;
        }
        return ans;
    }

    private void insert(int num) {
        TrieNode node = root;
        for (int b = BITS; b >= 0; b--) {
            int bit = (num >> b) & 1;
            if (node.children[bit] == null) node.children[bit] = new TrieNode();
            node = node.children[bit];
        }
    }

    private int query(int num) {
        TrieNode node = root;
        int result = 0;
        for (int b = BITS; b >= 0; b--) {
            int bit = (num >> b) & 1;
            int wanted = 1 - bit;
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
- When queries have a "value must be <= limit" filter, sort both the data and the queries by that limit and sweep — this "offline" trick avoids rebuilding a trie per query.
- The trie itself only ever needs to contain currently-eligible numbers; the pointer walk guarantees each number is inserted exactly once, in increasing order.
- Track whether the trie is non-empty (`anyInserted`) to correctly return `-1` for queries whose limit excludes every element.
