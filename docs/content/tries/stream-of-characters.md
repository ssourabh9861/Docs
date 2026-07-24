# Stream of Characters

**Difficulty:** Hard · **Pattern:** Trie built on reversed words + rolling suffix check against reversed trie on each streamed character · [LeetCode](https://leetcode.com/problems/stream-of-characters/)

## Problem
Design a `StreamChecker` that, given a list of words, supports a `query(letter)` call for each incoming character of a stream, returning `true` if some suffix of the characters seen so far (ending at the current character) forms one of the words.

## Examples
**Example 1**
```
Input:  ["StreamChecker","query","query","query","query","query","query","query","query","query","query","query","query"]
        [[["cd","f","kl"]],["a"],["b"],["c"],["d"],["e"],["f"],["g"],["h"],["i"],["j"],["k"],["l"]]
Output: [null,false,false,false,true,false,true,false,false,false,false,false,true]
Explanation: after streaming "cd" the suffix "cd" matches; after "f" the suffix "f" matches; after "...kl" the suffix "kl" matches.
```

## Constraints
- `1 <= words.length <= 2000`
- `1 <= words[i].length <= 200`
- `words[i]` consists of lowercase English letters
- `letter` is a lowercase English letter
- At most `4 * 10^4` calls to `query` are made

## Approach 1 — Keep a buffer, check all words as suffixes each query
**Idea.** Maintain a running buffer (or `StringBuilder`) of all streamed characters. On every `query`, for each word check whether the buffer ends with that word. Correct but re-scans every word (and the buffer's suffix) on every call.
**Complexity.** Time O(Q · words.length · maxWordLength), Space O(stream length + total word length).
```java
class StreamChecker {
    private List<String> words;
    private StringBuilder stream = new StringBuilder();

    public StreamChecker(String[] words) {
        this.words = Arrays.asList(words);
    }

    public boolean query(char letter) {
        stream.append(letter);
        String s = stream.toString();
        for (String w : words) {
            if (s.length() >= w.length() && s.endsWith(w)) return true;
        }
        return false;
    }
}
```

## Approach 2 — Trie of reversed words, walk backward from the newest character (optimal)
**Idea.** Insert the *reverse* of every word into a trie. Keep a bounded buffer of the most recent characters (only the last `maxWordLength` characters matter, since no word is longer). On each `query`, append the new letter to the buffer, then walk the reversed trie starting from the newest character going backward through the buffer: at each step, follow the trie edge for the current character; if a node marking the end of a (reversed) word is reached, some suffix of the stream matches a word, so return `true` immediately. If the trie has no matching child, stop early and return `false`. This limits each query to at most `maxWordLength` trie steps instead of rescanning every word.
**Complexity.** Time O(maxWordLength) per query (amortized, using the trie's branching to fail fast), O(total characters inserted) to build. Space O(total characters in words) for the trie, O(maxWordLength) for the buffer.
```java
class StreamChecker {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        boolean isWord = false;
    }

    private TrieNode root = new TrieNode();
    private StringBuilder buffer = new StringBuilder();
    private int maxLen = 0;

    public StreamChecker(String[] words) {
        for (String word : words) {
            maxLen = Math.max(maxLen, word.length());
            insertReversed(word);
        }
    }

    private void insertReversed(String word) {
        TrieNode node = root;
        for (int i = word.length() - 1; i >= 0; i--) {
            int idx = word.charAt(i) - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.isWord = true;
    }

    public boolean query(char letter) {
        buffer.append(letter);
        if (buffer.length() > maxLen) {
            buffer.delete(0, buffer.length() - maxLen); // keep only the tail we could ever need
        }

        TrieNode node = root;
        for (int i = buffer.length() - 1; i >= 0; i--) {
            int idx = buffer.charAt(i) - 'a';
            if (node.children[idx] == null) return false;
            node = node.children[idx];
            if (node.isWord) return true;
        }
        return false;
    }
}
```

## Key Takeaways
- Reversing the words at insertion time converts "does the stream end with word W" into "does walking backward from the newest character match a trie path" — an Aho-Corasick-flavored trick for suffix matching on a live stream.
- Bounding the buffer to the longest word length keeps each query O(maxWordLength) instead of growing with the whole stream.
- Early-exit as soon as a `isWord` node is hit — a shorter matching suffix already proves the answer is `true`.
