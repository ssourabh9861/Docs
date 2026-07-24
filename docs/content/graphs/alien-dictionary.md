# Alien Dictionary

**Difficulty:** Hard · **Pattern:** Topological Sort — build edges from adjacent word comparisons, Kahn's BFS over the 26-letter graph · [LeetCode](https://leetcode.com/problems/alien-dictionary/)

## Problem
Given a list of words sorted lexicographically according to an unknown alien alphabet, derive a valid ordering of the letters. Return `""` if the ordering is invalid (contradictory constraints or a longer word appearing as a prefix before its own prefix).

## Examples
**Example 1**
```
Input:  words = ["wrt","wrf","er","ett","rftt"]
Output: "wertf"
Explanation: Comparing adjacent words gives edges w->e, r->t, e->r, t->f, building a topo order.
```
**Example 2**
```
Input:  words = ["abc","ab"]
Output: ""
Explanation: "abc" comes before "ab" but is longer with "ab" as a prefix — invalid, since a prefix must sort before the word it extends.
```

## Constraints
- 1 <= words.length <= 100
- 1 <= words[i].length <= 20
- words[i] consists of lowercase English letters
- All characters used are among the 26 lowercase letters

## Approach 1 — DFS-based topo sort with cycle detection
**Idea.** For each adjacent pair of words, find the first differing character and add an edge `first -> second`. If no difference is found and the earlier word is longer, it's invalid. Then run DFS post-order topo sort over only the letters that actually appear, detecting cycles with a 3-color scheme.
**Complexity.** Time O(C) where C = total length of all words (edge building) + O(26 + E) for DFS, Space O(26 + E).
```java
class Solution {
    public String alienOrder(String[] words) {
        Map<Character, Set<Character>> adj = new HashMap<>();
        for (String w : words) {
            for (char c : w.toCharArray()) adj.putIfAbsent(c, new HashSet<>());
        }

        for (int i = 0; i < words.length - 1; i++) {
            String w1 = words[i], w2 = words[i + 1];
            int minLen = Math.min(w1.length(), w2.length());
            boolean found = false;
            for (int j = 0; j < minLen; j++) {
                char c1 = w1.charAt(j), c2 = w2.charAt(j);
                if (c1 != c2) {
                    adj.get(c1).add(c2);
                    found = true;
                    break;
                }
            }
            if (!found && w1.length() > w2.length()) return ""; // invalid prefix case
        }

        Map<Character, Integer> color = new HashMap<>(); // 0=unvisited,1=visiting,2=done
        StringBuilder sb = new StringBuilder();
        boolean[] cycle = {false};

        for (char c : adj.keySet()) {
            if (color.getOrDefault(c, 0) == 0) {
                if (!dfs(c, adj, color, sb)) return "";
            }
        }
        return sb.reverse().toString();
    }

    private boolean dfs(char u, Map<Character, Set<Character>> adj,
                         Map<Character, Integer> color, StringBuilder sb) {
        color.put(u, 1);
        for (char v : adj.get(u)) {
            int cv = color.getOrDefault(v, 0);
            if (cv == 1) return false; // cycle
            if (cv == 0 && !dfs(v, adj, color, sb)) return false;
        }
        color.put(u, 2);
        sb.append(u);
        return true;
    }
}
```

## Approach 2 — Kahn's BFS indegree (optimal)
**Idea.** Same edge-building step, but track indegree per letter. Start BFS from all letters with indegree 0; each time a letter is dequeued, append it and decrement its neighbors' indegree. If the final string doesn't cover every distinct letter, a cycle exists.
**Complexity.** Time O(C + 26), Space O(26 + E).
```java
class Solution {
    public String alienOrder(String[] words) {
        Map<Character, Set<Character>> adj = new HashMap<>();
        Map<Character, Integer> indegree = new HashMap<>();
        for (String w : words) {
            for (char c : w.toCharArray()) {
                adj.putIfAbsent(c, new HashSet<>());
                indegree.putIfAbsent(c, 0);
            }
        }

        for (int i = 0; i < words.length - 1; i++) {
            String w1 = words[i], w2 = words[i + 1];
            int minLen = Math.min(w1.length(), w2.length());
            boolean found = false;
            for (int j = 0; j < minLen; j++) {
                char c1 = w1.charAt(j), c2 = w2.charAt(j);
                if (c1 != c2) {
                    if (adj.get(c1).add(c2)) {
                        indegree.merge(c2, 1, Integer::sum);
                    }
                    found = true;
                    break;
                }
            }
            if (!found && w1.length() > w2.length()) return "";
        }

        Deque<Character> queue = new ArrayDeque<>();
        for (char c : indegree.keySet()) {
            if (indegree.get(c) == 0) queue.add(c);
        }

        StringBuilder sb = new StringBuilder();
        while (!queue.isEmpty()) {
            char u = queue.poll();
            sb.append(u);
            for (char v : adj.get(u)) {
                if (indegree.merge(v, -1, Integer::sum) == 0) queue.add(v);
            }
        }

        return sb.length() == indegree.size() ? sb.toString() : "";
    }
}
```

## Key Takeaways
- Only compare *adjacent* words in the sorted list — one differing character per pair is enough; comparing all pairs is wasteful and incorrect.
- The "longer word is a prefix of the shorter, earlier word" case is a silent invalidity check many solutions miss — always test it.
- When multiple valid topological orders exist, LeetCode accepts any of them; the indegree-0 seed set is not unique.
