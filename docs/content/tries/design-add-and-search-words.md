# Design Add and Search Words Data Structure

**Difficulty:** Medium · **Pattern:** Standard trie insert + DFS search that branches on the `.` wildcard · [LeetCode](https://leetcode.com/problems/design-add-and-search-words-data-structure/)

## Problem
Design a data structure that supports adding words and searching whether a word (which may contain `.` as a wildcard matching any single letter) exists among the added words.

## Examples
**Example 1**
```
Input:  ["WordDictionary","addWord","addWord","addWord","search","search","search","search"]
        [[],["bad"],["dad"],["mad"],["pad"],["bad"],[".ad"],["b.."]]
Output: [null,null,null,null,false,true,true,true]
Explanation: "pad" was never added so it returns false; ".ad" matches "bad"/"dad"/"mad"; "b.." matches "bad".
```

## Constraints
- `1 <= word.length <= 25`
- `word` in `addWord` consists of lowercase English letters
- `word` in `search` consists of `'.'` or lowercase English letters
- At most `2 * 10^4` calls in total to `addWord` and `search`
- At most 2 dots are used in every search query (in the general accepted solution any number of dots is handled)

## Approach 1 — Store all words in a list, brute-force match on search
**Idea.** Keep a `List<String>` of added words. On search, for every stored word of the same length, compare character by character, treating `.` as matching anything. This avoids a trie entirely but is slow when many words are stored.
**Complexity.** Time O(n · L) per search where n is the number of words and L is word length. Space O(n · L).
```java
class WordDictionary {
    private List<String> words = new ArrayList<>();

    public void addWord(String word) {
        words.add(word);
    }

    public boolean search(String word) {
        for (String w : words) {
            if (w.length() != word.length()) continue;
            if (matches(w, word)) return true;
        }
        return false;
    }

    private boolean matches(String stored, String query) {
        for (int i = 0; i < stored.length(); i++) {
            char q = query.charAt(i);
            if (q != '.' && q != stored.charAt(i)) return false;
        }
        return true;
    }
}
```

## Approach 2 — Trie with DFS wildcard search (optimal)
**Idea.** Insert words into a standard trie. To search, recursively walk the trie: for a normal letter, follow the single matching child (fail fast if absent); for `.`, try every non-null child and recurse — if any branch succeeds, the whole search succeeds. This shares prefixes across all stored words and only explores the wildcard's fan-out where needed.
**Complexity.** Time O(L) per search for words without dots; O(26^d · L) worst case with d dots. Space O(total characters inserted).
```java
class WordDictionary {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        boolean isWord = false;
    }

    private TrieNode root = new TrieNode();

    public void addWord(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.isWord = true;
    }

    public boolean search(String word) {
        return dfs(word, 0, root);
    }

    private boolean dfs(String word, int pos, TrieNode node) {
        if (node == null) return false;
        if (pos == word.length()) return node.isWord;

        char ch = word.charAt(pos);
        if (ch == '.') {
            for (TrieNode child : node.children) {
                if (child != null && dfs(word, pos + 1, child)) return true;
            }
            return false;
        } else {
            return dfs(word, pos + 1, node.children[ch - 'a']);
        }
    }
}
```

## Key Takeaways
- A trie turns "search among many stored words" into a single traversal shared by common prefixes, instead of comparing against every word individually.
- The `.` wildcard is handled by branching over all non-null children at that trie level rather than needing a special data structure.
- Passing `null` children safely short-circuits the recursion (`dfs` returns `false` immediately), keeping the code clean without extra bounds checks.
