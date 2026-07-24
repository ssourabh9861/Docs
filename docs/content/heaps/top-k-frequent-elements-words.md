# Top K Frequent Elements / Words

**Difficulty:** Medium · **Pattern:** frequency map + heap (or bucket sort) for Top-K · [LeetCode](https://leetcode.com/problems/top-k-frequent-elements/)

## Problem
Given an array of integers (or a list of words) and an integer `k`, return the `k` most frequent elements. For words, ties break lexicographically ascending.

## Examples
**Example 1**
```
Input:  nums = [1,1,1,2,2,3], k = 2
Output: [1,2]
Explanation: 1 appears 3 times, 2 appears 2 times — the two most frequent.
```
**Example 2**
```
Input:  words = ["i","love","leetcode","i","love","coding"], k = 2
Output: ["i","love"]
Explanation: "i" and "love" both appear twice, "i" comes first alphabetically among ties... here both tie at freq 2, ordered by dictionary order.
```

## Constraints
- 1 <= nums.length <= 10^5
- k is in the range [1, number of distinct elements]
- It is guaranteed the answer is unique (for the numeric version)

## Approach 1 — Min-heap of size k (heap-based)
**Idea.** Count frequencies with a hash map. Push `(element, freq)` pairs into a min-heap ordered by frequency (and lexicographic order for tie-breaking on words), keeping the heap size capped at `k` by popping the smallest whenever it overflows. Whatever remains in the heap at the end are the top-k elements.
**Complexity.** Time O(n log k), Space O(n + k).
```java
import java.util.*;

class Solution {
    public int[] topKFrequent(int[] nums, int k) {
        Map<Integer, Integer> freq = new HashMap<>();
        for (int num : nums) freq.merge(num, 1, Integer::sum);

        // min-heap by frequency: smallest frequency at top so we can evict it
        PriorityQueue<Map.Entry<Integer, Integer>> heap =
            new PriorityQueue<>(Comparator.comparingInt(Map.Entry::getValue));

        for (Map.Entry<Integer, Integer> entry : freq.entrySet()) {
            heap.offer(entry);
            if (heap.size() > k) heap.poll();
        }

        int[] result = new int[k];
        for (int i = k - 1; i >= 0; i--) {
            result[i] = heap.poll().getKey();
        }
        return result;
    }

    // Word variant: ties break lexicographically ascending among equal frequency
    public List<String> topKFrequentWords(String[] words, int k) {
        Map<String, Integer> freq = new HashMap<>();
        for (String w : words) freq.merge(w, 1, Integer::sum);

        // min-heap: lower freq first; for equal freq, LARGER word first (so it gets evicted first)
        PriorityQueue<String> heap = new PriorityQueue<>((a, b) -> {
            int fa = freq.get(a), fb = freq.get(b);
            if (fa != fb) return fa - fb;
            return b.compareTo(a);
        });

        for (String word : freq.keySet()) {
            heap.offer(word);
            if (heap.size() > k) heap.poll();
        }

        LinkedList<String> result = new LinkedList<>();
        while (!heap.isEmpty()) result.addFirst(heap.poll());
        return result;
    }
}
```

## Approach 2 — Bucket sort by frequency (optimal, O(n))
**Idea.** Frequencies are bounded by `n` (array length), so create `n + 1` buckets where `bucket[f]` holds all elements with frequency exactly `f`. Fill the buckets in one pass, then walk from `bucket[n]` down to `bucket[1]`, collecting elements until `k` are gathered. This avoids the log factor entirely since bucket index *is* the sort key.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.*;

class Solution {
    public int[] topKFrequent(int[] nums, int k) {
        Map<Integer, Integer> freq = new HashMap<>();
        for (int num : nums) freq.merge(num, 1, Integer::sum);

        int n = nums.length;
        List<List<Integer>> buckets = new ArrayList<>(n + 1);
        for (int i = 0; i <= n; i++) buckets.add(new ArrayList<>());

        for (Map.Entry<Integer, Integer> entry : freq.entrySet()) {
            buckets.get(entry.getValue()).add(entry.getKey());
        }

        int[] result = new int[k];
        int idx = 0;
        for (int f = n; f >= 1 && idx < k; f--) {
            for (int num : buckets.get(f)) {
                if (idx == k) break;
                result[idx++] = num;
            }
        }
        return result;
    }
}
```

## Key Takeaways
- Heap-of-size-k is the general-purpose Top-K tool: O(n log k), works even when the frequency domain is unbounded or exotic tie-break rules apply.
- Bucket sort by frequency beats the heap to O(n) because frequency is bounded by array length — a common trick whenever the sort key has a small known range.
- For word ties, remember the min-heap eviction order is the *opposite* of the desired output order — invert the comparator's tie-break direction and reverse when draining.
