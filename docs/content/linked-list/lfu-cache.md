# LFU Cache

**Difficulty:** Hard · **Pattern:** HashMap + frequency buckets, each bucket a doubly linked list ordered by recency (O(1) get/put) · [LeetCode](https://leetcode.com/problems/lfu-cache/)

## Problem
Design a Least Frequently Used (LFU) cache with fixed capacity supporting `get(key)` and `put(key, value)` in `O(1)` average time. On eviction, remove the least frequently used key; break ties among equally-frequent keys by evicting the least recently used one among them. Every `get` and successful `put` on an existing key increments that key's use frequency.

## Examples
**Example 1**
```
Input:
["LFUCache", "put", "put", "get", "put", "get", "get", "put", "get", "get", "get"]
[[2], [1,1], [2,2], [1], [3,3], [2], [3], [4,4], [1], [3], [4]]
Output:
[null, null, null, 1, null, -1, 3, null, -1, 3, 4]
Explanation: Capacity 2. put(3,3) evicts key 2 (freq 1, LFU) over key 1 (freq 2 after get(1)).
put(4,4) evicts key 1 (freq 2) over key 3 (freq 2) — both tied on frequency, but 1 is less recently used.
```

## Constraints
- `1 <= capacity <= 10^4`
- `0 <= key <= 10^5`
- `0 <= value <= 10^9`
- At most `2 * 10^5` calls total to `get` and `put`.

## Approach 1 — Two HashMaps + frequency-bucketed doubly linked lists (optimal)
**Idea.** Maintain:
- `keyToNode: key -> Node` where `Node` holds `key, value, freq`.
- `freqToList: freq -> DoublyLinkedList` — all nodes with that exact frequency, ordered by recency (most-recent at head, LRU at tail), using sentinel head/tail per list like in LRU Cache.
- `minFreq` — the smallest frequency currently present, needed to know which bucket to evict from.

On `get(key)`: look up the node, bump its frequency by removing it from `freqToList[freq]` and re-inserting at the front of `freqToList[freq+1]` (creating that bucket if needed). If the old bucket becomes empty and `freq == minFreq`, increment `minFreq`.

On `put(key, value)`: if key exists, update value and do the same frequency-bump as `get`. Otherwise, if at capacity, evict the tail (LRU) node of `freqToList[minFreq]` and remove it from `keyToNode`. Insert the new node with `freq = 1` at the front of `freqToList[1]`, and reset `minFreq = 1`.
**Complexity.** Time `O(1)` for both `get` and `put`, Space `O(capacity)`.
```java
class LFUCache {

    private class Node {
        int key, value, freq = 1;
        Node prev, next;
        Node(int key, int value) {
            this.key = key;
            this.value = value;
        }
    }

    private class DList {
        Node head = new Node(-1, -1);
        Node tail = new Node(-1, -1);
        int size = 0;
        DList() {
            head.next = tail;
            tail.prev = head;
        }
        void addFront(Node node) {
            node.next = head.next;
            node.prev = head;
            head.next.prev = node;
            head.next = node;
            size++;
        }
        void remove(Node node) {
            node.prev.next = node.next;
            node.next.prev = node.prev;
            size--;
        }
        Node removeLRU() {
            if (size == 0) return null;
            Node lru = tail.prev;
            remove(lru);
            return lru;
        }
    }

    private final int capacity;
    private int minFreq;
    private final Map<Integer, Node> keyToNode;
    private final Map<Integer, DList> freqToList;

    public LFUCache(int capacity) {
        this.capacity = capacity;
        this.minFreq = 0;
        this.keyToNode = new HashMap<>();
        this.freqToList = new HashMap<>();
    }

    public int get(int key) {
        Node node = keyToNode.get(key);
        if (node == null) return -1;
        bumpFreq(node);
        return node.value;
    }

    public void put(int key, int value) {
        if (capacity == 0) return;

        Node node = keyToNode.get(key);
        if (node != null) {
            node.value = value;
            bumpFreq(node);
            return;
        }

        if (keyToNode.size() == capacity) {
            DList minList = freqToList.get(minFreq);
            Node evicted = minList.removeLRU();
            keyToNode.remove(evicted.key);
        }

        Node fresh = new Node(key, value);
        keyToNode.put(key, fresh);
        freqToList.computeIfAbsent(1, f -> new DList()).addFront(fresh);
        minFreq = 1;
    }

    private void bumpFreq(Node node) {
        int oldFreq = node.freq;
        DList oldList = freqToList.get(oldFreq);
        oldList.remove(node);
        if (oldList.size == 0) {
            freqToList.remove(oldFreq);
            if (minFreq == oldFreq) minFreq++;
        }

        node.freq++;
        freqToList.computeIfAbsent(node.freq, f -> new DList()).addFront(node);
    }
}
```

## Key Takeaways
- `minFreq` only ever needs to increase by exactly 1 when the old min bucket empties out (never decreases mid-flight) and resets to `1` on every insert of a brand-new key — this keeps the update O(1) without scanning frequencies.
- Each frequency bucket is itself an LRU list (sentinel-based doubly linked list) — LFU is essentially "LRU cache of LRU caches," bucketed by frequency.
- Classic trap: forgetting to reset `minFreq = 1` after inserting a new key, or forgetting to advance `minFreq` only when the *current* min bucket (not just any bucket) becomes empty.
- Related: LRU Cache (the recency-only special case), Design Twitter (similar multi-map + ordering composition).
