# Smallest String With Swaps

**Difficulty:** Hard · **Pattern:** Union-Find (DSU) — group indices connected by allowed swaps, sort each group's characters independently · [LeetCode](https://leetcode.com/problems/smallest-string-with-swaps/)

## Problem
Given a string `s` and a list of index pairs `pairs` that can be swapped any number of times (in any order), return the lexicographically smallest string achievable.

## Examples
**Example 1**
```
Input:  s = "dcab", pairs = [[0,3],[1,2]]
Output: "bacd"
Explanation: Indices {0,3} form one swappable group and {1,2} another; sort chars within each group's index positions.
```
**Example 2**
```
Input:  s = "dcab", pairs = [[0,3],[1,2],[0,2]]
Output: "abcd"
Explanation: Now {0,1,2,3} are all connected transitively (0-3, 1-2, 0-2), so the whole string can be freely sorted.
```

## Constraints
- 1 <= s.length <= 10^5
- 0 <= pairs.length <= 10^5
- 0 <= pairs[i][0], pairs[i][1] < s.length
- s consists of lowercase English letters

## Approach 1 — Build adjacency, DFS each component, sort chars, place back
**Idea.** Build an undirected graph from `pairs`. For each connected component found via DFS/BFS, collect the indices and the characters at those indices, sort the characters, and reassign them back to the sorted indices (so the smallest character goes to the smallest index in the component, etc.).
**Complexity.** Time O(n log n) overall (sorting dominates), Space O(n).
```java
class Solution {
    public String smallestStringWithSwaps(String s, List<List<Integer>> pairs) {
        int n = s.length();
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
        for (List<Integer> p : pairs) {
            adj.get(p.get(0)).add(p.get(1));
            adj.get(p.get(1)).add(p.get(0));
        }

        char[] chars = s.toCharArray();
        boolean[] visited = new boolean[n];

        for (int i = 0; i < n; i++) {
            if (!visited[i]) {
                List<Integer> indices = new ArrayList<>();
                Deque<Integer> stack = new ArrayDeque<>();
                stack.push(i);
                visited[i] = true;
                while (!stack.isEmpty()) {
                    int u = stack.pop();
                    indices.add(u);
                    for (int v : adj.get(u)) {
                        if (!visited[v]) { visited[v] = true; stack.push(v); }
                    }
                }

                Collections.sort(indices);
                List<Character> letters = new ArrayList<>();
                for (int idx : indices) letters.add(chars[idx]);
                Collections.sort(letters);

                for (int k = 0; k < indices.size(); k++) {
                    chars[indices.get(k)] = letters.get(k);
                }
            }
        }
        return new String(chars);
    }
}
```

## Approach 2 — Union-Find groups, bucket indices by root, sort per bucket (optimal)
**Idea.** Union every pair with DSU. Group all indices by their DSU root using a map. For each group, extract the characters at those indices, sort them, sort the indices themselves, and write the sorted characters back to the sorted index positions. This is functionally the same result as DFS but avoids explicit adjacency-list construction and repeated stack traversal.
**Complexity.** Time O(n α(n) + n log n), Space O(n).
```java
class Solution {
    private int[] parent;

    public String smallestStringWithSwaps(String s, List<List<Integer>> pairs) {
        int n = s.length();
        parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        for (List<Integer> p : pairs) {
            union(p.get(0), p.get(1));
        }

        Map<Integer, List<Integer>> groups = new HashMap<>();
        for (int i = 0; i < n; i++) {
            groups.computeIfAbsent(find(i), k -> new ArrayList<>()).add(i);
        }

        char[] chars = s.toCharArray();
        for (List<Integer> indices : groups.values()) {
            List<Character> letters = new ArrayList<>();
            for (int idx : indices) letters.add(chars[idx]);
            Collections.sort(letters);
            Collections.sort(indices); // ensure ascending index order

            for (int k = 0; k < indices.size(); k++) {
                chars[indices.get(k)] = letters.get(k);
            }
        }
        return new String(chars);
    }

    private int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    private void union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra != rb) parent[ra] = rb;
    }
}
```

## Key Takeaways
- Any set of indices connected via swap pairs (directly or transitively) can be freely permuted among themselves — reduce this to "sort the characters, sort the indices, zip them together" per component.
- DSU groups replace explicit graph traversal cleanly here since we only need "which component does each index belong to," not path information.
- Greedy per-component sorting works because swaps within a component are unrestricted (any permutation reachable via adjacent transpositions of the connected pairs), unlike problems where only specific permutations are allowed.
