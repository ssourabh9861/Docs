# Sort Items by Groups Respecting Dependencies

**Difficulty:** Hard · **Pattern:** Two-level Topological Sort — topo sort groups, then topo sort items within each group, merge in group order · [LeetCode](https://leetcode.com/problems/sort-items-by-groups-respecting-dependencies/)

## Problem
There are `n` items, each optionally belonging to one of `m` groups (`group[i] == -1` means ungrouped, treated as its own singleton group). `beforeItems[i]` lists items that must come before item `i`. Return a valid ordering of all items respecting both item dependencies and the constraint that items in the same group stay contiguous in group-dependency order. Return `[]` if impossible.

## Examples
**Example 1**
```
Input:  n = 8, m = 2, group = [-1,-1,1,0,0,1,0,-1],
        beforeItems = [[],[6],[5],[6],[3,6],[],[],[]]
Output: [6,3,4,1,5,2,0,7]
Explanation: Group items are kept together per group topo order, item deps respected throughout.
```
**Example 2**
```
Input:  n = 3, m = 2, group = [0,0,1], beforeItems = [[1],[0],[]]
Output: []
Explanation: Item 0 needs item 1 first and item 1 needs item 0 first — a cycle within group 0's item graph.
```

## Constraints
- 1 <= m <= n <= 3*10^4
- group.length == beforeItems.length == n
- -1 <= group[i] <= m-1
- 0 <= beforeItems[i].length <= n-1

## Approach 1 — Naive: assign ungrouped items unique new group IDs, then two separate Kahn topo sorts
**Idea.** First, give every ungrouped item (`group[i] == -1`) its own fresh group id so every item belongs to exactly one group. Build a group-level graph (edge `groupA -> groupB` if some item in A must precede some item in B) and an item-level graph (edge `a -> b` for every `b in beforeItems[a]`... actually `a` must precede `b`, so edge `a -> b`). Topo sort groups; topo sort items. Bucket sorted items by group, then output buckets in group topo order.
**Complexity.** Time O(V + E) for both graphs, Space O(V + E).
```java
class Solution {
    public int[] sortItems(int n, int m, int[] group, List<List<Integer>> beforeItems) {
        int groupCount = m;
        for (int i = 0; i < n; i++) {
            if (group[i] == -1) group[i] = groupCount++;
        }

        // Item-level graph
        List<List<Integer>> itemAdj = new ArrayList<>();
        int[] itemIndeg = new int[n];
        for (int i = 0; i < n; i++) itemAdj.add(new ArrayList<>());

        // Group-level graph
        List<List<Integer>> groupAdj = new ArrayList<>();
        int[] groupIndeg = new int[groupCount];
        for (int i = 0; i < groupCount; i++) groupAdj.add(new ArrayList<>());

        for (int b = 0; b < n; b++) {
            for (int a : beforeItems.get(b)) {
                itemAdj.get(a).add(b);
                itemIndeg[b]++;
                if (group[a] != group[b]) {
                    groupAdj.get(group[a]).add(group[b]);
                    groupIndeg[group[b]]++;
                }
            }
        }

        List<Integer> itemOrder = topoSort(itemAdj, itemIndeg, n);
        List<Integer> groupOrder = topoSort(groupAdj, groupIndeg, groupCount);
        if (itemOrder == null || groupOrder == null) return new int[0];

        // bucket items by group, preserving item topo order inside each bucket
        Map<Integer, List<Integer>> buckets = new HashMap<>();
        for (int item : itemOrder) {
            buckets.computeIfAbsent(group[item], x -> new ArrayList<>()).add(item);
        }

        int[] result = new int[n];
        int idx = 0;
        for (int g : groupOrder) {
            for (int item : buckets.getOrDefault(g, Collections.emptyList())) {
                result[idx++] = item;
            }
        }
        return result;
    }

    private List<Integer> topoSort(List<List<Integer>> adj, int[] indeg, int count) {
        Deque<Integer> queue = new ArrayDeque<>();
        for (int i = 0; i < count; i++) if (indeg[i] == 0) queue.add(i);

        List<Integer> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            int u = queue.poll();
            order.add(u);
            for (int v : adj.get(u)) {
                if (--indeg[v] == 0) queue.add(v);
            }
        }
        return order.size() == count ? order : null;
    }
}
```

## Approach 2 — Same algorithm, arrays instead of adjacency-of-lists for groups (optimal, minor constant-factor cleanup)
**Idea.** Identical two-level Kahn's algorithm; the only change worth calling "optimal" here is avoiding duplicate group edges (an item-level edge crossing groups can appear many times, inflating indegree and adjacency size). Deduplicate group edges with a `Set` before building the group graph so `O(V+E)` doesn't degrade to `O(E)` with a large constant on dense inputs.
**Complexity.** Time O(V + E), Space O(V + E).
```java
class Solution {
    public int[] sortItems(int n, int m, int[] group, List<List<Integer>> beforeItems) {
        int groupCount = m;
        for (int i = 0; i < n; i++) if (group[i] == -1) group[i] = groupCount++;

        List<List<Integer>> itemAdj = new ArrayList<>();
        int[] itemIndeg = new int[n];
        for (int i = 0; i < n; i++) itemAdj.add(new ArrayList<>());

        List<Set<Integer>> groupAdjSet = new ArrayList<>();
        for (int i = 0; i < groupCount; i++) groupAdjSet.add(new HashSet<>());
        int[] groupIndeg = new int[groupCount];

        for (int b = 0; b < n; b++) {
            for (int a : beforeItems.get(b)) {
                itemAdj.get(a).add(b);
                itemIndeg[b]++;
                int ga = group[a], gb = group[b];
                if (ga != gb && groupAdjSet.get(ga).add(gb)) {
                    groupIndeg[gb]++;
                }
            }
        }

        List<Integer> itemOrder = kahn(itemAdj, itemIndeg, n);
        if (itemOrder == null) return new int[0];

        List<List<Integer>> groupAdj = new ArrayList<>();
        for (Set<Integer> s : groupAdjSet) groupAdj.add(new ArrayList<>(s));
        List<Integer> groupOrder = kahn(groupAdj, groupIndeg, groupCount);
        if (groupOrder == null) return new int[0];

        Map<Integer, List<Integer>> buckets = new HashMap<>();
        for (int item : itemOrder) {
            buckets.computeIfAbsent(group[item], x -> new ArrayList<>()).add(item);
        }

        int[] result = new int[n];
        int idx = 0;
        for (int g : groupOrder) {
            for (int item : buckets.getOrDefault(g, Collections.emptyList())) {
                result[idx++] = item;
            }
        }
        return result;
    }

    private List<Integer> kahn(List<List<Integer>> adj, int[] indeg, int count) {
        Deque<Integer> queue = new ArrayDeque<>();
        for (int i = 0; i < count; i++) if (indeg[i] == 0) queue.add(i);
        List<Integer> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            int u = queue.poll();
            order.add(u);
            for (int v : adj.get(u)) if (--indeg[v] == 0) queue.add(v);
        }
        return order.size() == count ? order : null;
    }
}
```

## Key Takeaways
- Assign every ungrouped item a fresh singleton group id up front — this collapses "items with no group" and "items with a group" into one uniform two-level model.
- Two independent Kahn topo sorts (items, groups) are combined by bucketing the item order into group buckets and emitting buckets in group-topo order — the item order *within* a bucket is preserved from the item-level sort.
- Watch for duplicate cross-group edges inflating indegree; dedupe with a `Set` when the same group pair has many item-level dependency edges between them.
