# Replace Words

**Difficulty:** Medium · **Pattern:** Trie of roots, walk each sentence word and stop at the first terminal node (shortest matching root) · [LeetCode](https://leetcode.com/problems/replace-words/)

## Problem
Given a dictionary of root words and a sentence, replace every word in the sentence that has a root as a prefix with that (shortest) root. Words without any matching root are left unchanged.

## Examples
**Example 1**
```
Input:  dictionary = ["cat","bat","rat"], sentence = "the cattle was rattled by the battery"
Output: "the cat was rat by the bat"
Explanation: "cattle" starts with root "cat" -> replaced by "cat"; "rattled" -> "rat"; "battery" -> "bat".
```

## Constraints
- `1 <= dictionary.length <= 1000`
- `1 <= dictionary[i].length <= 100`
- `dictionary[i]` consists of only lowercase letters
- `1 <= sentence.length <= 10^6`
- `sentence` consists of only lowercase letters and spaces
- The number of words in `sentence` is in the range `[1, 1000]`
- The length of each word in `sentence` is in the range `[1, 1000]`

## Approach 1 — HashSet of roots, try every prefix length
**Idea.** Store all roots in a `HashSet`. For each word in the sentence, try prefixes of increasing length (starting from length 1) and check set membership; the first prefix found in the set is the shortest matching root, so replace the word with it. This avoids a trie but redoes substring creation and hashing for every prefix length tried.
**Complexity.** Time O(sentence length · average word length^2) due to substring creation and hashing. Space O(total root characters).
```java
class Solution {
    public String replaceWords(List<String> dictionary, String sentence) {
        Set<String> roots = new HashSet<>(dictionary);
        String[] words = sentence.split(" ");
        StringBuilder result = new StringBuilder();

        for (String word : words) {
            String replacement = word;
            for (int i = 1; i <= word.length(); i++) {
                String prefix = word.substring(0, i);
                if (roots.contains(prefix)) {
                    replacement = prefix;
                    break;
                }
            }
            if (result.length() > 0) result.append(' ');
            result.append(replacement);
        }
        return result.toString();
    }
}
```

## Approach 2 — Trie of roots, walk each word and stop at first terminal node (optimal)
**Idea.** Insert all roots into a trie. For each sentence word, walk the trie one character at a time; as soon as a node marking the end of a root is reached, that's the shortest matching root (since it was found first while walking left to right) — stop and use it as the replacement. If the walk runs out of trie edges (or the word ends) before hitting a root marker, the word is left unchanged. This avoids allocating a new substring for every prefix length tried.
**Complexity.** Time O(total sentence characters) since each character of each word is visited once. Space O(total root characters) for the trie.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        boolean isRoot = false;
    }

    private TrieNode root = new TrieNode();

    public String replaceWords(List<String> dictionary, String sentence) {
        for (String r : dictionary) insert(r);

        String[] words = sentence.split(" ");
        StringBuilder result = new StringBuilder();
        for (String word : words) {
            if (result.length() > 0) result.append(' ');
            result.append(shortestRoot(word));
        }
        return result.toString();
    }

    private void insert(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.isRoot = true;
    }

    private String shortestRoot(String word) {
        TrieNode node = root;
        for (int i = 0; i < word.length(); i++) {
            int idx = word.charAt(i) - 'a';
            if (node.children[idx] == null) return word; // no matching root
            node = node.children[idx];
            if (node.isRoot) return word.substring(0, i + 1);
        }
        return word; // whole word walked without hitting a root marker
    }
}
```

## Key Takeaways
- Walking a trie character-by-character and stopping at the first terminal node directly gives the *shortest* matching prefix, with no need to compare multiple candidate prefixes.
- This avoids repeated substring allocation and hashing that a `HashSet`-based prefix search incurs, turning the whole replacement into one linear pass over the sentence.
- The trie is built once from the (usually much smaller) root dictionary and reused for every word in the (possibly huge) sentence.
