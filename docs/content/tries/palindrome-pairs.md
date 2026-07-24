# Palindrome Pairs

**Difficulty:** Hard · **Pattern:** Trie of reversed words storing index + palindrome-suffix list, matched against each word's prefixes/suffixes · [LeetCode](https://leetcode.com/problems/palindrome-pairs/)

## Problem
Given a list of unique words, return all pairs of indices `(i, j)` such that `words[i] + words[j]` is a palindrome.

## Examples
**Example 1**
```
Input:  words = ["abcd","dcba","lls","s","sssll"]
Output: [[0,1],[1,0],[3,2],[2,4]]
Explanation: "abcd"+"dcba"="abcddcba" (palindrome), "dcba"+"abcd"="dcbaabcd" (palindrome),
             "s"+"lls"="slls" (palindrome), "lls"+"sssll"="llssssll" (palindrome).
```

## Constraints
- `1 <= words.length <= 5000`
- `0 <= words[i].length <= 300`
- `words[i]` consists of lowercase English letters
- All words are unique

## Approach 1 — Brute force all ordered pairs
**Idea.** Check every ordered pair `(i, j)` with `i != j` by concatenating and testing for a palindrome directly. Simple but quadratic in the number of words times linear in string length.
**Complexity.** Time O(n^2 · L), Space O(1) extra.
```java
class Solution {
    public List<List<Integer>> palindromePairs(String[] words) {
        List<List<Integer>> result = new ArrayList<>();
        int n = words.length;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (i == j) continue;
                String combined = words[i] + words[j];
                if (isPalindrome(combined)) result.add(Arrays.asList(i, j));
            }
        }
        return result;
    }

    private boolean isPalindrome(String s) {
        int l = 0, r = s.length() - 1;
        while (l < r) {
            if (s.charAt(l) != s.charAt(r)) return false;
            l++; r--;
        }
        return true;
    }
}
```

## Approach 2 — Trie of reversed words with palindrome-suffix indices (optimal)
**Idea.** Insert the *reverse* of every word into a trie, and at each trie node also record the index of any word whose remaining (yet-to-be-consumed) suffix is itself a palindrome (so it can be paired even if not fully matched). Also store the word's original index at the terminal node of its reversal. Then for each word `w` at index `i`, walk the trie of reversed words character by character following `w` itself: 
1. Whenever the current trie node marks a completed reversed word at index `j` (meaning `words[j]` reversed matches the prefix consumed so far) and the *remaining* suffix of `w` is a palindrome, then `words[j] + words[i]` (or `words[i] + words[j]`, depending on direction) is a palindrome — because `words[j]` reversed equals the consumed prefix of `w`, so `words[j]` is the mirror of that prefix.
2. When the walk fully consumes `w` and lands on a trie node, any palindrome-suffix index stored at or below that node (i.e., any reversed word which has `w`'s reversal as a prefix, with the extra remainder being a palindrome) also produces a valid pair.
This finds all pairs where one word is a prefix/suffix of the other's reversal, handling both directions and different-length words in one pass per word, using a trie to share the common suffix/prefix structure.

A cleaner, well-tested equivalent formulation: for each word `w`, build the trie over the **reversed** words, and for each split point `k` of `w` into `w[0..k)` and `w[k..n)`:
- If `w[0..k)` reversed exists in the trie at index `j != i` and `w[k..n)` is a palindrome, then `words[j] + w` is a palindrome (pair `(j, i)`).
- If `w[k..n)` reversed exists in the trie at index `j != i` and `w[0..k)` is a palindrome, then `w + words[j]` is a palindrome (pair `(i, j)`).

Implemented via the trie walk below.
**Complexity.** Time O(n · L^2) worst case (L^2 from palindrome checks at each split), Space O(n · L) for the trie.
```java
class Solution {
    class TrieNode {
        TrieNode[] children = new TrieNode[26];
        int wordIndex = -1;           // index of word whose reversal ends exactly here
        List<Integer> palinSuffixIdx = new ArrayList<>(); // indices whose remaining reversed suffix (below this node) is a palindrome
    }

    private TrieNode root = new TrieNode();

    public List<List<Integer>> palindromePairs(String[] words) {
        int n = words.length;
        for (int i = 0; i < n; i++) insert(words[i], i);

        List<List<Integer>> result = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            search(words[i], i, result);
        }
        return result;
    }

    private void insert(String word, int index) {
        TrieNode node = root;
        int n = word.length();
        for (int i = n - 1; i >= 0; i--) { // insert reversed
            if (isPalindrome(word, 0, i)) { // prefix word[0..i] (inclusive) is a palindrome
                node.palinSuffixIdx.add(index);
            }
            int idx = word.charAt(i) - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.wordIndex = index;
        node.palinSuffixIdx.add(index); // empty remaining prefix counts as palindrome
    }

    private void search(String word, int index, List<List<Integer>> result) {
        TrieNode node = root;
        int n = word.length();
        for (int i = 0; i < n; i++) {
            // words[j] + word is palindrome if reversed-word-j ends here and rest of `word` is palindrome
            if (node.wordIndex != -1 && node.wordIndex != index && isPalindrome(word, i, n - 1)) {
                result.add(Arrays.asList(node.wordIndex, index));
            }
            int idx = word.charAt(i) - 'a';
            if (node.children[idx] == null) return;
            node = node.children[idx];
        }
        // Fully consumed `word` walking the reversed trie: check palindrome-suffix indices below.
        for (int j : node.palinSuffixIdx) {
            if (j != index) result.add(Arrays.asList(index, j));
        }
    }

    private boolean isPalindrome(String s, int lo, int hi) {
        while (lo < hi) {
            if (s.charAt(lo) != s.charAt(hi)) return false;
            lo++; hi--;
        }
        return true;
    }
}
```

## Key Takeaways
- Inserting *reversed* words into a trie lets you match "is this word (or a prefix of it) the mirror of another word" via a straightforward forward walk of the query word.
- Storing palindrome-suffix indices at each trie node (during insertion) handles the case where one word is longer than the other and the leftover chunk must itself be a palindrome.
- Guard against `j == index` (pairing a word with itself) and remember palindrome pairs are ordered, so both directions must be considered.
