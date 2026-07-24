# Word Search II

**Difficulty:** Hard · **Pattern:** Trie of all target words + DFS backtracking with pruning on a letter grid · [LeetCode](https://leetcode.com/problems/word-search-ii/)

## Problem
Given an `m x n` board of characters and a list of words, return all words present in the board. A word is built from adjacent cells (horizontally or vertically), and the same cell may not be reused within one word.

## Examples
**Example 1**
```
Input:  board = [["o","a","a","n"],["e","t","a","e"],["i","h","k","r"],["i","f","l","v"]],
        words = ["oath","pea","eat","rain"]
Output: ["eat","oath"]
Explanation: "oath" is found top-left going right then down; "eat" is found along the second column/row diagonExplanation path; "pea" and "rain" are not on the board.
```

## Constraints
- `1 <= m, n <= 12`
- `1 <= words.length <= 3 * 10^4`
- `1 <= words[i].length <= 10`
- `board[i][j]` and `words[i]` consist of lowercase English letters
- All strings in `words` are unique

## Approach 1 — Search each word individually with DFS
**Idea.** For each word, try every cell as a starting point and run a backtracking DFS that matches the word character by character, marking visited cells. This is simple but repeats work: overlapping prefixes among words are searched from scratch every time, and failed prefixes are not shared.
**Complexity.** Time O(words.length · m · n · 4^L) where L is average word length. Space O(L) for recursion.
```java
class Solution {
    private int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

    public List<String> findWords(char[][] board, String[] words) {
        List<String> result = new ArrayList<>();
        for (String word : words) {
            if (exists(board, word)) result.add(word);
        }
        return result;
    }

    private boolean exists(char[][] board, String word) {
        int m = board.length, n = board[0].length;
        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                if (dfs(board, i, j, word, 0)) return true;
        return false;
    }

    private boolean dfs(char[][] board, int r, int c, String word, int idx) {
        if (idx == word.length()) return true;
        if (r < 0 || c < 0 || r >= board.length || c >= board[0].length) return false;
        if (board[r][c] != word.charAt(idx)) return false;

        char tmp = board[r][c];
        board[r][c] = '#';
        boolean found = false;
        for (int[] d : dirs) {
            if (dfs(board, r + d[0], c + d[1], word, idx + 1)) { found = true; break; }
        }
        board[r][c] = tmp;
        return found;
    }
}
```

## Approach 2 — Build a Trie of all words, DFS once with pruning (optimal)
**Idea.** Insert every word into a trie (storing the completed word at the terminal node). Run a single DFS from every board cell that walks the trie in lock-step with the grid: at each cell, move to `trieNode.children[board[r][c]]` if it exists, otherwise stop immediately (prune). Whenever a trie node marks the end of a word, record it and clear the word from that node (avoid duplicates). After exploring, remove leaf nodes with no remaining words to keep the trie/traversal fast (optional but useful for skewed inputs). This shares common prefixes across all words in one traversal instead of restarting for each word.
**Complexity.** Time O(m · n · 4^L) in the worst case, but heavily pruned in practice since the trie stops descending on a mismatch. Space O(sum of word lengths) for the trie.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        String word = null; // set when this node completes a word
    }

    private TrieNode root = new TrieNode();

    public List<String> findWords(char[][] board, String[] words) {
        for (String w : words) insert(w);

        List<String> result = new ArrayList<>();
        int m = board.length, n = board[0].length;
        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                dfs(board, i, j, root, result);
        return result;
    }

    private void insert(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.word = word;
    }

    private void dfs(char[][] board, int r, int c, TrieNode node, List<String> result) {
        if (r < 0 || c < 0 || r >= board.length || c >= board[0].length) return;
        char ch = board[r][c];
        if (ch == '#' || node.children[ch - 'a'] == null) return;

        TrieNode next = node.children[ch - 'a'];
        if (next.word != null) {
            result.add(next.word);
            next.word = null; // avoid duplicate additions
        }

        board[r][c] = '#';
        dfs(board, r + 1, c, next, result);
        dfs(board, r - 1, c, next, result);
        dfs(board, r, c + 1, next, result);
        dfs(board, r, c - 1, next, result);
        board[r][c] = ch;

        // Optional pruning: drop fully-exhausted leaf nodes
        boolean hasChild = false;
        for (TrieNode child : next.children) if (child != null) { hasChild = true; break; }
        if (!hasChild && next.word == null) node.children[ch - 'a'] = null;
    }
}
```

## Key Takeaways
- Building one trie from all words and walking it alongside the DFS turns "search each word separately" into a single shared traversal that prunes on the first mismatched prefix.
- Store the completed word (or a boolean + reference) at the trie's terminal node so a match can be reported directly, and null it out afterward to prevent duplicate results.
- Optional node pruning (deleting exhausted trie branches) keeps later DFS calls fast when many words share cells but exhaust quickly.
