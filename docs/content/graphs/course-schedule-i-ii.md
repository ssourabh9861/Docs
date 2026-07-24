# Course Schedule I/II

**Difficulty:** Medium · **Pattern:** Topological Sort — Kahn's BFS with indegree array, cycle detection via count of visited nodes · [LeetCode](https://leetcode.com/problems/course-schedule/)

## Problem
Given `numCourses` and a list of prerequisite pairs `[a, b]` (take `b` before `a`), determine if all courses can be finished (Course Schedule I), and if so, return one valid order (Course Schedule II). Both reduce to: does the prerequisite graph have a cycle, and if not, what is a topological order.

## Examples
**Example 1**
```
Input:  numCourses = 2, prerequisites = [[1,0]]
Output: true (I), [0,1] (II)
Explanation: Take course 0 first, then course 1. No cycle.
```
**Example 2**
```
Input:  numCourses = 2, prerequisites = [[1,0],[0,1]]
Output: false (I), [] (II)
Explanation: 0 depends on 1 and 1 depends on 0 — a cycle, impossible to finish.
```

## Constraints
- 1 <= numCourses <= 2000
- 0 <= prerequisites.length <= 5000
- prerequisites[i].length == 2
- No duplicate edges, `a != b`

## Approach 1 — DFS with 3-color cycle detection
**Idea.** Build adjacency list `course -> prerequisite-dependents`. DFS each node marking WHITE/GRAY/BLACK; hitting a GRAY node means a back-edge, i.e. a cycle. Push nodes to result on finish (post-order), then reverse for topological order.
**Complexity.** Time O(V + E), Space O(V + E).
```java
class Solution {
    private List<List<Integer>> adj;
    private int[] color; // 0=white,1=gray,2=black
    private int[] order;
    private int idx;
    private boolean hasCycle;

    public int[] findOrder(int numCourses, int[][] prerequisites) {
        adj = new ArrayList<>();
        for (int i = 0; i < numCourses; i++) adj.add(new ArrayList<>());
        // edge: prerequisite -> course (prerequisite must come first)
        for (int[] p : prerequisites) adj.get(p[1]).add(p[0]);

        color = new int[numCourses];
        order = new int[numCourses];
        idx = numCourses - 1;
        hasCycle = false;

        for (int i = 0; i < numCourses && !hasCycle; i++) {
            if (color[i] == 0) dfs(i);
        }
        return hasCycle ? new int[0] : order;
    }

    private void dfs(int u) {
        color[u] = 1;
        for (int v : adj.get(u)) {
            if (color[v] == 1) { hasCycle = true; return; }
            if (color[v] == 0) {
                dfs(v);
                if (hasCycle) return;
            }
        }
        color[u] = 2;
        order[idx--] = u;
    }
}
```

## Approach 2 — Kahn's BFS (optimal, iterative)
**Idea.** Compute indegree of every course. Push all indegree-0 nodes to a queue. Repeatedly pop a node, append to result, and decrement indegree of its neighbors, pushing any that drop to 0. If the result contains all `numCourses` nodes, no cycle exists; otherwise a cycle blocks completion.
**Complexity.** Time O(V + E), Space O(V + E).
```java
class Solution {
    public int[] findOrder(int numCourses, int[][] prerequisites) {
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < numCourses; i++) adj.add(new ArrayList<>());
        int[] indegree = new int[numCourses];

        for (int[] p : prerequisites) {
            adj.get(p[1]).add(p[0]); // b -> a
            indegree[p[0]]++;
        }

        Deque<Integer> queue = new ArrayDeque<>();
        for (int i = 0; i < numCourses; i++) {
            if (indegree[i] == 0) queue.add(i);
        }

        int[] order = new int[numCourses];
        int idx = 0;
        while (!queue.isEmpty()) {
            int u = queue.poll();
            order[idx++] = u;
            for (int v : adj.get(u)) {
                if (--indegree[v] == 0) queue.add(v);
            }
        }

        return idx == numCourses ? order : new int[0];
    }

    // Course Schedule I is just: return idx == numCourses (boolean form)
    public boolean canFinish(int numCourses, int[][] prerequisites) {
        return findOrder(numCourses, prerequisites).length == numCourses;
    }
}
```

## Key Takeaways
- Kahn's algorithm is the go-to for topo sort + cycle detection in one pass; DFS coloring is the alternative when recursion depth is acceptable.
- A cycle exists iff the BFS result size is smaller than the number of nodes (some nodes never reach indegree 0).
- This exact indegree-BFS template reappears in Alien Dictionary, Sequence Reconstruction, and Sort Items by Groups.
