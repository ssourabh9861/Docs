# Word Squares

**Difficulty:** Hard · **Pattern:** Trie of words indexed by prefix + backtracking, using each partial column as the next row's required prefix · [LeetCode](https://leetcode.com/problems/word-squares/)

## Problem
Given a list of unique words (all the same length), return all word squares that can be formed: a sequence of words such that the k-th letter of every row equals the k-th letter of the row's own column read top-to-bottom (i.e., `square[i][j] == square[j][i]` for all valid `i, j`).

## Examples
**Example 1**
```
Input:  words = ["area","lead","wall","lady","ball"]
Output: [["wall","area","lead","lady"],["ball","area","lead","lady"]]
Explanation: For ["wall","area","lead","lady"], column 0 spells "wall", column 1 spells "area", etc., matching the rows.
```

## Constraints
- `1 <= words.length <= 1000`
- `1 <= words[i].length <= 5`
- All `words[i]` have the same length
- `words[i]` consists of only lowercase English letters
- All `words[i]` are unique

## Approach 1 — Backtracking with a HashMap prefix index
**Idea.** Precompute, for every prefix of every word, the list of words having that prefix (using a `HashMap<String, List<String>>`). Backtrack row by row: at row `k`, the required prefix is the string formed by taking character `k` from each of the previously chosen rows (i.e., column `k`'s partial content). Look up candidate words with that prefix in the map, try each, and recurse. This avoids a full trie class but still indexes prefixes explicitly.
**Complexity.** Time O(n · L · 26^L) worst case (bounded by branching), Space O(n · L^2) for all prefix entries.
```java
class Solution {
    public List<List<String>> wordSquares(String[] words) {
        List<List<String>> result = new ArrayList<>();
        if (words.length == 0) return result;
        int L = words[0].length();

        Map<String, List<String>> prefixMap = new HashMap<>();
        for (String w : words) {
            for (int i = 1; i <= L; i++) {
                prefixMap.computeIfAbsent(w.substring(0, i), k -> new ArrayList<>()).add(w);
            }
        }

        List<String> square = new ArrayList<>();
        for (String w : words) {
            square.add(w);
            backtrack(square, L, prefixMap, result);
            square.remove(square.size() - 1);
        }
        return result;
    }

    private void backtrack(List<String> square, int L, Map<String, List<String>> prefixMap, List<List<String>> result) {
        int row = square.size();
        if (row == L) {
            result.add(new ArrayList<>(square));
            return;
        }
        StringBuilder prefix = new StringBuilder();
        for (String s : square) prefix.append(s.charAt(row));

        List<String> candidates = prefixMap.getOrDefault(prefix.toString(), Collections.emptyList());
        for (String cand : candidates) {
            square.add(cand);
            backtrack(square, L, prefixMap, result);
            square.remove(square.size() - 1);
        }
    }
}
```

## Approach 2 — Trie of words with prefix-matching word lists at each node (optimal)
**Idea.** Build an explicit trie over the words, and at every trie node keep the list of words that pass through that node (i.e., share that prefix). Backtrack row by row exactly as above, but instead of a hash-map lookup, walk the trie along the needed prefix's characters to directly reach the node holding the candidate list — this is the canonical trie-based formulation and avoids recomputing/storing substring keys in a hash map, using trie edges instead.
**Complexity.** Time O(n · L · 26^L) worst case bounded by branching factor, but constant factors are lower since no substring hashing occurs. Space O(n · L) for the trie plus stored word lists.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        List<String> words = new ArrayList<>(); // words passing through this node (sharing this prefix)
    }

    private TrieNode root = new TrieNode();

    public List<List<String>> wordSquares(String[] words) {
        List<List<String>> result = new ArrayList<>();
        if (words.length == 0) return result;
        int L = words[0].length();

        for (String w : words) insert(w);

        List<String> square = new ArrayList<>();
        for (String w : words) {
            square.add(w);
            backtrack(square, L, result);
            square.remove(square.size() - 1);
        }
        return result;
    }

    private void insert(String word) {
        TrieNode node = root;
        node.words.add(word);
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
            node.words.add(word);
        }
    }

    private List<String> wordsWithPrefix(String prefix) {
        TrieNode node = root;
        for (char ch : prefix.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) return Collections.emptyList();
            node = node.children[idx];
        }
        return node.words;
    }

    private void backtrack(List<String> square, int L, List<List<String>> result) {
        int row = square.size();
        if (row == L) {
            result.add(new ArrayList<>(square));
            return;
        }
        StringBuilder prefix = new StringBuilder();
        for (String s : square) prefix.append(s.charAt(row));

        for (String cand : wordsWithPrefix(prefix.toString())) {
            square.add(cand);
            backtrack(square, L, result);
            square.remove(square.size() - 1);
        }
    }
}
```

## Key Takeaways
- The key insight is that adding row `k` fixes column `k`'s next required prefix, so backtracking with prefix lookups (trie or hash map) prunes the search dramatically compared to brute-force permutations.
- Storing the list of words passing through each trie node (rather than only at terminal nodes) gives O(prefix length) lookup for "all words starting with this prefix."
- Both the hash-map and trie approaches share the same backtracking skeleton; the trie variant simply replaces string-keyed lookups with node traversal, which generalizes better to longer alphabets/prefixes.
