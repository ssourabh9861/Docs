# Reconstruct Itinerary

**Difficulty:** Hard · **Pattern:** Eulerian path via Hierholzer's algorithm · [LeetCode](https://leetcode.com/problems/reconstruct-itinerary/)

## Problem
Given a list of airline tickets `[from, to]`, reconstruct the itinerary starting from `"JFK"` that uses all tickets exactly once. If multiple valid itineraries exist, return the lexicographically smallest one.

## Examples
**Example 1**
```
Input:  tickets = [["MUC","LHR"],["JFK","MUC"],["SFO","SJC"],["LHR","SFO"]]
Output: ["JFK","MUC","LHR","SFO","SJC"]
Explanation: This uses all 4 tickets exactly once starting at JFK, and is the only valid itinerary here.
```

## Constraints
- `1 <= tickets.length <= 300`
- `tickets[i].length == 2`
- `from_i != to_i`
- Tickets may contain duplicates (must all be used).
- It is guaranteed that at least one valid itinerary exists using all tickets.

## Approach 1 — Backtracking over available tickets
**Idea.** Sort destinations for each airport so we try lexicographically smallest options first. DFS: pick an unused ticket from the current airport, mark it used, recurse; if the recursion completes an itinerary of the right length, we're done, otherwise backtrack and try the next option. Works but can be exponential on graphs with many valid partial paths that dead-end.
**Complexity.** Time O(E^2) worst case (bounded by backtracking over degree-limited choices), Space O(E).
```java
class Solution {
    private Map<String, List<String>> graph = new HashMap<>();
    private Map<String, boolean[]> used = new HashMap<>();
    private List<String> result;
    private int totalTickets;

    public List<String> findItinerary(List<List<String>> tickets) {
        totalTickets = tickets.size();
        Map<String, List<String>> raw = new HashMap<>();
        for (List<String> t : tickets) {
            raw.computeIfAbsent(t.get(0), k -> new ArrayList<>()).add(t.get(1));
        }
        for (Map.Entry<String, List<String>> e : raw.entrySet()) {
            List<String> dests = e.getValue();
            Collections.sort(dests);
            graph.put(e.getKey(), dests);
            used.put(e.getKey(), new boolean[dests.size()]);
        }

        List<String> path = new ArrayList<>();
        path.add("JFK");
        dfs("JFK", path);
        return result;
    }

    private boolean dfs(String airport, List<String> path) {
        if (path.size() == totalTickets + 1) {
            result = new ArrayList<>(path);
            return true;
        }
        List<String> dests = graph.get(airport);
        if (dests == null) return false;
        boolean[] usedArr = used.get(airport);

        for (int i = 0; i < dests.size(); i++) {
            if (usedArr[i]) continue;
            usedArr[i] = true;
            path.add(dests.get(i));
            if (dfs(dests.get(i), path)) return true;
            path.remove(path.size() - 1);
            usedArr[i] = false;
        }
        return false;
    }
}
```

## Approach 2 — Hierholzer's algorithm for Eulerian path (optimal)
**Idea.** This is exactly an Eulerian-path problem: find a trail using every edge once starting at JFK. Hierholzer's algorithm greedily walks unused edges (always the lexicographically smallest available) via a min-heap per node, pushing visited airports on a stack, and backtracking to a stack top with remaining edges when stuck. Reversing the completion order (post-order) gives the itinerary.
**Complexity.** Time O(E log E) (heap operations dominate), Space O(E).
```java
class Solution {
    public List<String> findItinerary(List<List<String>> tickets) {
        Map<String, PriorityQueue<String>> graph = new HashMap<>();
        for (List<String> t : tickets) {
            graph.computeIfAbsent(t.get(0), k -> new PriorityQueue<>()).offer(t.get(1));
        }

        Deque<String> path = new ArrayDeque<>();
        Deque<String> stack = new ArrayDeque<>();
        stack.push("JFK");

        while (!stack.isEmpty()) {
            String airport = stack.peek();
            PriorityQueue<String> dests = graph.get(airport);
            if (dests == null || dests.isEmpty()) {
                path.push(stack.pop());
            } else {
                stack.push(dests.poll());
            }
        }

        return new ArrayList<>(path);
    }
}
```

## Key Takeaways
- Reconstructing an itinerary that uses every edge exactly once is a textbook Eulerian-path problem, not a generic pathfinding problem — Hierholzer's algorithm is the right tool.
- Using a min-heap per node ensures the greedy walk always tries lexicographically smallest destinations first, satisfying the tie-breaking requirement without extra sorting.
- The final answer is the *reverse post-order* of the Hierholzer walk — nodes are pushed to the output stack only once they have no more unused outgoing edges, so dead-ends surface correctly before their predecessors.
