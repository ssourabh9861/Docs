# Sequence Reconstruction

**Difficulty:** Hard · **Pattern:** Topological Sort — check the graph built from sequences yields a *unique* topo order matching `nums` exactly · [LeetCode](https://leetcode.com/problems/sequence-reconstruction/)

## Problem
Given an array `nums` (a permutation of 1..n) and a list of sequences, determine whether `nums` is the *unique* shortest common supersequence that can be reconstructed from the given sequences — i.e., every sequence's relative order is a sub-constraint, and there must be exactly one valid topological order equal to `nums`.

## Examples
**Example 1**
```
Input:  nums = [1,2,3], sequences = [[1,2],[1,3]]
Output: false
Explanation: [1,2,3] and [1,3,2] both satisfy the sequences — the order isn't unique.
```
**Example 2**
```
Input:  nums = [1,2,3], sequences = [[1,2],[1,3],[2,3]]
Output: true
Explanation: Edges 1->2, 1->3, 2->3 force the unique order 1,2,3, matching nums.
```

## Constraints
- 1 <= nums.length <= 10^4
- nums is a permutation of integers 1 to n
- 1 <= sequences.length <= 10^4
- 1 <= sequences[i].length <= 10^2
- All values in sequences[i] are within [1, n]

## Approach 1 — Build graph from sequences, run Kahn's BFS, verify queue always has exactly one node
**Idea.** Add an edge `a -> b` for every adjacent pair in each sequence, tracking indegree. Also mark every number that actually appears in some sequence — if any number 1..n never appears, reconstruction is impossible. Run Kahn's algorithm; at every step the BFS queue must contain **exactly one** node (proving uniqueness), and the dequeued node must match the corresponding position in `nums` in order. If either check fails, or the total output size differs from `n`, return false.
**Complexity.** Time O(n + S) where S = total length of all sequences, Space O(n + S).
```java
class Solution {
    public boolean sequenceReconstruction(int[] nums, List<List<Integer>> sequences) {
        int n = nums.length;
        List<Set<Integer>> adj = new ArrayList<>();
        int[] indegree = new int[n + 1];
        boolean[] seen = new boolean[n + 1];
        for (int i = 0; i <= n; i++) adj.add(new HashSet<>());

        for (List<Integer> seq : sequences) {
            for (int x : seq) {
                if (x < 1 || x > n) return false; // out-of-range value
                seen[x] = true;
            }
            for (int i = 0; i + 1 < seq.size(); i++) {
                int a = seq.get(i), b = seq.get(i + 1);
                if (adj.get(a).add(b)) {
                    indegree[b]++;
                }
            }
        }

        for (int i = 1; i <= n; i++) {
            if (!seen[i]) return false; // number missing from all sequences
        }

        Deque<Integer> queue = new ArrayDeque<>();
        for (int i = 1; i <= n; i++) {
            if (indegree[i] == 0) queue.add(i);
        }

        int idx = 0;
        while (!queue.isEmpty()) {
            if (queue.size() > 1) return false; // more than one choice -> not unique
            int u = queue.poll();
            if (idx >= n || nums[idx++] != u) return false; // must match nums exactly

            for (int v : adj.get(u)) {
                if (--indegree[v] == 0) queue.add(v);
            }
        }

        return idx == n;
    }
}
```

## Approach 2 — Same BFS but validate uniqueness only where nums has adjacent-position ambiguity (optimal / early exit)
**Idea.** Functionally identical to Approach 1, but exit as early as possible: check `seen[]` completeness before building the full adjacency (cheap short-circuit), and fail fast the moment the queue size exceeds 1 or a mismatch occurs, avoiding unnecessary further processing. This is the same asymptotic complexity but tightens constants for large inputs — the true optimal is still Kahn's BFS since uniqueness of topological order is inherently checked by queue-size-1 at every step.
**Complexity.** Time O(n + S), Space O(n + S).
```java
class Solution {
    public boolean sequenceReconstruction(int[] nums, List<List<Integer>> sequences) {
        int n = nums.length;
        int[] indegree = new int[n + 1];
        List<Set<Integer>> adj = new ArrayList<>();
        for (int i = 0; i <= n; i++) adj.add(new HashSet<>());
        boolean[] seen = new boolean[n + 1];
        int seenCount = 0;

        for (List<Integer> seq : sequences) {
            Integer prev = null;
            for (int x : seq) {
                if (x < 1 || x > n) return false;
                if (!seen[x]) { seen[x] = true; seenCount++; }
                if (prev != null && adj.get(prev).add(x)) {
                    indegree[x]++;
                }
                prev = x;
            }
        }
        if (seenCount != n) return false;

        Deque<Integer> queue = new ArrayDeque<>();
        for (int i = 1; i <= n; i++) if (indegree[i] == 0) queue.add(i);

        int idx = 0;
        while (!queue.isEmpty()) {
            if (queue.size() != 1) return false;
            int u = queue.poll();
            if (nums[idx++] != u) return false;
            for (int v : adj.get(u)) {
                if (--indegree[v] == 0) queue.add(v);
            }
        }
        return idx == n;
    }
}
```

## Key Takeaways
- Uniqueness of a topological order is exactly "the Kahn BFS queue never has more than one candidate node at any step" — a very reusable check.
- Every value 1..n must be referenced by at least one sequence, or the graph can't possibly reconstruct the full permutation.
- Deduplicate edges with a `Set` per node — repeated identical edges across sequences would otherwise inflate indegree and break the algorithm.
