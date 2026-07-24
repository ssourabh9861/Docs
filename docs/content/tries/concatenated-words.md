# Concatenated Words

**Difficulty:** Hard · **Pattern:** Trie of all words + DFS/DP word-break check per word · [LeetCode](https://leetcode.com/problems/concatenated-words/)

## Problem
Given a list of distinct words, return all words that can be formed by concatenating at least two other (shorter) words from the same list.

## Examples
**Example 1**
```
Input:  words = ["cat","cats","catsdogcats","dog","dogcatsdog","hippopotamuses","rat","ratcatdogcat"]
Output: ["catsdogcats","dogcatsdog","ratcatdogcat"]
Explanation: "catsdogcats" = "cats"+"dog"+"cats"; "dogcatsdog" = "dog"+"cats"+"dog"; "ratcatdogcat" = "rat"+"cat"+"dog"+"cat".
```

## Constraints
- `1 <= words.length <= 10^4`
- `0 <= words[i].length <= 1000`
- `words[i]` consists of only lowercase English letters
- All elements of `words` are distinct

## Approach 1 — HashSet + word-break DP per word
**Idea.** Put all words in a `HashSet` for O(1) lookup. For each candidate word, run the classic word-break DP: `dp[i]` is true if the prefix of length `i` can be split into words from the set (excluding using the whole word itself as its only piece — require at least 2 parts). Reachability of `dp[word.length()]` with more than one piece means it's concatenated. This works without a trie but redoes substring hashing for every check.
**Complexity.** Time O(sum(L_i^2)) since each word does O(L^2) substring/dp work with hashing. Space O(total characters) for the set.
```java
class Solution {
    public List<String> findAllConcatenatedWordsInADict(String[] words) {
        Set<String> dict = new HashSet<>(Arrays.asList(words));
        List<String> result = new ArrayList<>();
        for (String word : words) {
            if (!word.isEmpty() && canForm(word, dict)) result.add(word);
        }
        return result;
    }

    private boolean canForm(String word, Set<String> dict) {
        int n = word.length();
        boolean[] dp = new boolean[n + 1];
        dp[0] = true;
        for (int i = 1; i <= n; i++) {
            for (int j = 0; j < i; j++) {
                if (!dp[j]) continue;
                // Disallow the trivial split "whole word as its own single piece"
                if (j == 0 && i == n) continue;
                if (dict.contains(word.substring(j, i))) {
                    dp[i] = true;
                    break;
                }
            }
        }
        return dp[n];
    }
}
```

## Approach 2 — Trie of all words, DFS word-break with prefix pruning (optimal)
**Idea.** Insert every word into a trie so that shared prefixes are traversed once. For each candidate word, run a DFS/DP over positions `0..n`: from position `start`, walk the trie character by character; whenever you land on a node marking the end of a *different, already-inserted* word (i.e., not requiring the whole candidate to be used as a single piece), recurse from that end position. If recursion reaches the end of the word using at least two pieces, it's concatenated. Memoize failed starting positions to prevent recomputation. The trie avoids repeated substring hashing/creation that `Set.contains(word.substring(...))` incurs.
**Complexity.** Time O(sum(L_i^2)) in the worst case (still bounded by walking the trie per starting index) but with much lower constants than substring+hash approaches, and the trie shares structure across all words. Space O(total characters) for the trie.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        boolean isWord = false;
    }

    private TrieNode root = new TrieNode();

    public List<String> findAllConcatenatedWordsInADict(String[] words) {
        // Insert longer-word-safe: insert all words up front (self-check is guarded during DFS).
        for (String w : words) {
            if (!w.isEmpty()) insert(w);
        }

        List<String> result = new ArrayList<>();
        for (String word : words) {
            if (word.isEmpty()) continue;
            Boolean[] memo = new Boolean[word.length() + 1];
            if (dfs(word, 0, 0, memo)) result.add(word);
        }
        return result;
    }

    private void insert(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.isWord = true;
    }

    // start: current position in the word; pieceCount: how many complete words used so far.
    private boolean dfs(String word, int start, int pieceCount, Boolean[] memo) {
        if (start == word.length()) return pieceCount >= 2;
        if (memo[start] != null) return memo[start];

        TrieNode node = root;
        for (int i = start; i < word.length(); i++) {
            int idx = word.charAt(i) - 'a';
            if (node.children[idx] == null) { memo[start] = false; return false; }
            node = node.children[idx];
            if (node.isWord) {
                if (dfs(word, i + 1, pieceCount + 1, memo)) { memo[start] = true; return true; }
            }
        }
        memo[start] = false;
        return false;
    }
}
```

## Key Takeaways
- Word-break-style DP is the core idea; a trie replaces repeated `substring` + hash-set lookups with a single shared character walk, which matters when words are long.
- Track how many complete pieces have been used so a word is not counted as "concatenated" from just itself (require `pieceCount >= 2`).
- Memoizing failed starting indices per candidate word prevents exponential blowup on adversarial inputs (e.g., long words with many partial matches).
