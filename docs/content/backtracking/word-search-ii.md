# Word Search II

**Difficulty:** Hard · **Pattern:** trie-pruned DFS/backtracking over a grid · [LeetCode](https://leetcode.com/problems/word-search-ii/)

## Problem
Given an `m x n` board of letters and a list of `words`, return all words from the list that can be formed by a path of adjacent (horizontally/vertically) cells, without reusing a cell within one word.

## Examples
**Example 1**
```
Input:  board = [["o","a","a","n"],["e","t","a","e"],["i","h","k","r"],["i","f","l","v"]],
        words = ["oath","pea","eat","rain"]
Output: ["eat","oath"]
Explanation: "oath" is spelled by o(0,0)->a(0,1)->t(1,1)->h(2,1); "eat" by e(1,0)->a(1,2)... adjacent path exists; "pea" and "rain" don't.
```

## Constraints
- `1 <= m, n <= 12`
- `1 <= words.length <= 3*10^4`, `1 <= words[i].length <= 10`
- board and words consist of lowercase English letters
- All `words[i]` are distinct

## Approach 1 — DFS per word (brute force)
**Idea.** For each word independently, try every cell as a start and run a standard DFS/backtracking word-search: mark the current cell visited, recurse to the 4 neighbors matching the next character, then un-mark before returning. This directly reuses the single-word "Word Search I" solution but repeats grid traversal once per word.
**Complexity.** Time O(W · m·n · 4^L) where W = number of words, L = average word length, Space O(L) recursion.
```java
import java.util.*;

class Solution {
    public List<String> findWords(char[][] board, String[] words) {
        List<String> result = new ArrayList<>();
        int m = board.length, n = board[0].length;
        for (String word : words) {
            boolean found = false;
            for (int r = 0; r < m && !found; r++) {
                for (int c = 0; c < n && !found; c++) {
                    if (dfs(board, r, c, word, 0)) found = true;
                }
            }
            if (found) result.add(word);
        }
        return result;
    }

    private boolean dfs(char[][] board, int r, int c, String word, int idx) {
        if (idx == word.length()) return true;
        if (r < 0 || r >= board.length || c < 0 || c >= board[0].length) return false;
        if (board[r][c] != word.charAt(idx)) return false;

        char tmp = board[r][c];
        board[r][c] = '#'; // choose (mark visited)

        boolean found = dfs(board, r + 1, c, word, idx + 1)
                      || dfs(board, r - 1, c, word, idx + 1)
                      || dfs(board, r, c + 1, word, idx + 1)
                      || dfs(board, r, c - 1, word, idx + 1);

        board[r][c] = tmp; // un-choose
        return found;
    }
}
```

## Approach 2 — Trie-pruned DFS (optimal / pruned)
**Idea.** Insert all words into a Trie so common prefixes are explored once. Run a single DFS from every board cell that walks the Trie alongside the board: at cell `(r,c)` with trie node `node`, move to `node.children[board[r][c]]`; if that child doesn't exist, prune immediately (no word starts with this prefix). If the child marks the end of a word, record it and null out `child.word` to avoid duplicate collection. After exploring all 4 neighbors, un-mark the cell. As an extra prune, remove a Trie leaf once fully consumed so future DFS calls don't revisit dead branches.
**Complexity.** Time O(m·n·4^L) total (shared prefixes cut redundant work dramatically), Space O(Σ|words[i]|) for the Trie plus O(L) recursion.
```java
import java.util.*;

class Solution {
    static class TrieNode {
        TrieNode[] children = new TrieNode[26];
        String word = null; // set at the node completing a word
    }

    private TrieNode buildTrie(String[] words) {
        TrieNode root = new TrieNode();
        for (String w : words) {
            TrieNode node = root;
            for (char ch : w.toCharArray()) {
                int i = ch - 'a';
                if (node.children[i] == null) node.children[i] = new TrieNode();
                node = node.children[i];
            }
            node.word = w;
        }
        return root;
    }

    public List<String> findWords(char[][] board, String[] words) {
        TrieNode root = buildTrie(words);
        List<String> result = new ArrayList<>();
        int m = board.length, n = board[0].length;
        for (int r = 0; r < m; r++) {
            for (int c = 0; c < n; c++) {
                dfs(board, r, c, root, result);
            }
        }
        return result;
    }

    private void dfs(char[][] board, int r, int c, TrieNode node, List<String> result) {
        if (r < 0 || r >= board.length || c < 0 || c >= board[0].length) return;
        char ch = board[r][c];
        if (ch == '#' || node.children[ch - 'a'] == null) return; // prune: dead cell or no such prefix

        TrieNode next = node.children[ch - 'a'];
        if (next.word != null) {
            result.add(next.word);
            next.word = null; // avoid duplicate additions
        }

        board[r][c] = '#'; // choose (mark visited)
        dfs(board, r + 1, c, next, result);
        dfs(board, r - 1, c, next, result);
        dfs(board, r, c + 1, next, result);
        dfs(board, r, c - 1, next, result);
        board[r][c] = ch; // un-choose

        // extra prune: drop fully-consumed leaves so future DFS stops earlier
        boolean hasChild = false;
        for (TrieNode child : next.children) {
            if (child != null) { hasChild = true; break; }
        }
        if (!hasChild) node.children[ch - 'a'] = null;
    }
}
```

## Key Takeaways
- Searching per-word from scratch repeats identical prefix traversal for words that share letters — a Trie merges that shared work into one DFS pass over the board.
- Marking the current cell (`'#'`) before recursing and restoring it after is the choose/un-choose backtracking pattern applied to grid traversal, preventing a word from reusing a cell.
- Nulling `next.word` after collecting it avoids duplicate results without needing a separate `visited` set for words.
- Pruning dead Trie leaves (nodes with no remaining children and no word) is optional but keeps later DFS calls from wasting time walking into exhausted branches — valuable when `words.length` is large.
