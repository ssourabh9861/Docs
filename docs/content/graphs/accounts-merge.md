# Accounts Merge

**Difficulty:** Medium · **Pattern:** Union-Find (DSU) — union accounts sharing an email, then group emails by root and sort · [LeetCode](https://leetcode.com/problems/accounts-merge/)

## Problem
Given a list of accounts, each `[name, email1, email2, ...]`, merge accounts that share at least one email (same person can have multiple accounts with the same name but different email sets). Return the merged accounts with emails sorted, one account per distinct person.

## Examples
**Example 1**
```
Input:  accounts = [["John","johnsmith@mail.com","john_newyork@mail.com"],
                     ["John","johnsmith@mail.com","john00@mail.com"],
                     ["Mary","mary@mail.com"],
                     ["John","johnny@mail.com"]]
Output: [["John","john00@mail.com","john_newyork@mail.com","johnsmith@mail.com"],
         ["Mary","mary@mail.com"],
         ["John","johnny@mail.com"]]
Explanation: First two "John" accounts share "johnsmith@mail.com" so they merge; the third "John" has no shared email.
```
**Example 2**
```
Input:  accounts = [["Alex","a@mail.com"]]
Output: [["Alex","a@mail.com"]]
Explanation: Single account, nothing to merge.
```

## Constraints
- 1 <= accounts.length <= 1000
- 2 <= accounts[i].length <= 10
- 1 <= accounts[i][j].length <= 30
- accounts[i][0] consists of English letters
- accounts[i][j] (for j > 0) is a valid email

## Approach 1 — HashMap graph + DFS/BFS to find connected components of emails
**Idea.** Build a graph where every email in the same account is connected to the first email of that account. Traverse (DFS/BFS) to find connected components of emails, tie each component's owner name from any account containing one of its emails, sort emails, and assemble the result.
**Complexity.** Time O(N·K log(N·K)) for sorting all emails (N accounts, K emails each), Space O(N·K).
```java
class Solution {
    public List<List<String>> accountsMerge(List<List<String>> accounts) {
        Map<String, List<String>> graph = new HashMap<>();
        Map<String, String> emailToName = new HashMap<>();

        for (List<String> account : accounts) {
            String name = account.get(0);
            String first = account.get(1);
            graph.putIfAbsent(first, new ArrayList<>());
            emailToName.put(first, name);
            for (int i = 2; i < account.size(); i++) {
                String email = account.get(i);
                graph.putIfAbsent(email, new ArrayList<>());
                graph.get(first).add(email);
                graph.get(email).add(first);
                emailToName.put(email, name);
            }
        }

        Set<String> visited = new HashSet<>();
        List<List<String>> result = new ArrayList<>();

        for (String email : graph.keySet()) {
            if (visited.add(email)) {
                List<String> component = new ArrayList<>();
                Deque<String> stack = new ArrayDeque<>();
                stack.push(email);
                while (!stack.isEmpty()) {
                    String cur = stack.pop();
                    component.add(cur);
                    for (String next : graph.get(cur)) {
                        if (visited.add(next)) stack.push(next);
                    }
                }
                Collections.sort(component);
                component.add(0, emailToName.get(email));
                result.add(component);
            }
        }
        return result;
    }
}
```

## Approach 2 — Union-Find on account indices, then bucket emails by root (optimal)
**Idea.** Map each email to the first account index that introduced it. For every subsequent account containing an already-seen email, union the current account index with the one that first owned that email. After processing all accounts, group emails by their DSU root account index, sort each group, and prefix with that account's name.
**Complexity.** Time O(N·K·α(N) + N·K log K), Space O(N·K).
```java
class Solution {
    private int[] parent;

    public List<List<String>> accountsMerge(List<List<String>> accounts) {
        int n = accounts.size();
        parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        Map<String, Integer> emailToAccount = new HashMap<>();
        for (int i = 0; i < n; i++) {
            List<String> account = accounts.get(i);
            for (int j = 1; j < account.size(); j++) {
                String email = account.get(j);
                if (emailToAccount.containsKey(email)) {
                    union(i, emailToAccount.get(email));
                } else {
                    emailToAccount.put(email, i);
                }
            }
        }

        Map<Integer, TreeSet<String>> rootToEmails = new HashMap<>();
        for (Map.Entry<String, Integer> entry : emailToAccount.entrySet()) {
            int root = find(entry.getValue());
            rootToEmails.computeIfAbsent(root, k -> new TreeSet<>()).add(entry.getKey());
        }

        List<List<String>> result = new ArrayList<>();
        for (Map.Entry<Integer, TreeSet<String>> entry : rootToEmails.entrySet()) {
            String name = accounts.get(entry.getKey()).get(0);
            List<String> merged = new ArrayList<>();
            merged.add(name);
            merged.addAll(entry.getValue());
            result.add(merged);
        }
        return result;
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
- Union-Find over *account indices* (not emails) avoids building an explicit email graph and is the cleaner DSU formulation for this problem.
- A `TreeSet<String>` per DSU root gives sorted, deduplicated emails for free without a separate sort call.
- The graph/DFS approach is conceptually simpler but does more work; DSU is the standard "optimal" answer expected in interviews for this exact pattern.
