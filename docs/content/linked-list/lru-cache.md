# LRU Cache

**Difficulty:** Medium · **Pattern:** HashMap + doubly linked list for O(1) get/put with recency ordering · [LeetCode](https://leetcode.com/problems/lru-cache/)

## Problem
Design a data structure that implements a Least Recently Used (LRU) cache with fixed capacity. It must support `get(key)` and `put(key, value)` in `O(1)` average time. When the cache exceeds capacity on insert, the least recently used entry is evicted.

## Examples
**Example 1**
```
Input:
["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"]
[[2], [1,1], [2,2], [1], [3,3], [2], [4,4], [1], [3], [4]]
Output:
[null, null, null, 1, null, -1, null, -1, 3, 4]
Explanation: Capacity 2. put(3,3) evicts key 2 (2 is LRU after get(1)); put(4,4) evicts key 1.
```

## Constraints
- `1 <= capacity <= 3000`
- `0 <= key <= 10^4`
- `0 <= value <= 10^5`
- At most `2 * 10^5` calls total to `get` and `put`.

## Approach 1 — HashMap + manual doubly linked list (optimal)
**Idea.** Maintain a HashMap from key to node, and a doubly linked list ordered by recency: the head-adjacent sentinel side is most-recently-used, the tail-adjacent sentinel side is least-recently-used. On `get`, look up in O(1), then unlink and re-insert the node right after the head sentinel (mark as most recent). On `put`, if key exists, update value and move to front; otherwise create a node, insert at front, and if over capacity, remove the node just before the tail sentinel (the LRU node) and delete its key from the map. Two dummy sentinels (`head`, `tail`) eliminate null checks at the boundaries.
**Complexity.** Time `O(1)` for both `get` and `put`, Space `O(capacity)`.
```java
class LRUCache {

    private class DNode {
        int key, value;
        DNode prev, next;
        DNode(int key, int value) {
            this.key = key;
            this.value = value;
        }
    }

    private final int capacity;
    private final Map<Integer, DNode> map;
    private final DNode head; // sentinel: head.next is most recently used
    private final DNode tail; // sentinel: tail.prev is least recently used

    public LRUCache(int capacity) {
        this.capacity = capacity;
        this.map = new HashMap<>();
        head = new DNode(-1, -1);
        tail = new DNode(-1, -1);
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        DNode node = map.get(key);
        if (node == null) return -1;
        moveToFront(node);
        return node.value;
    }

    public void put(int key, int value) {
        DNode node = map.get(key);
        if (node != null) {
            node.value = value;
            moveToFront(node);
            return;
        }
        if (map.size() == capacity) {
            DNode lru = tail.prev;
            remove(lru);
            map.remove(lru.key);
        }
        DNode fresh = new DNode(key, value);
        map.put(key, fresh);
        insertAfterHead(fresh);
    }

    private void remove(DNode node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    private void insertAfterHead(DNode node) {
        node.next = head.next;
        node.prev = head;
        head.next.prev = node;
        head.next = node;
    }

    private void moveToFront(DNode node) {
        remove(node);
        insertAfterHead(node);
    }
}
```

## Approach 2 — LinkedHashMap (accessOrder = true)
**Idea.** Java's `LinkedHashMap` maintains insertion or access order internally as a doubly linked list already. Constructing it with `accessOrder = true` reorders entries on every `get`/`put` access, and overriding `removeEldestEntry` lets it auto-evict the LRU entry once size exceeds capacity. This is the pragmatic production/interview shortcut — mention the manual version if asked to implement it "from scratch."
**Complexity.** Time `O(1)` amortized for both operations, Space `O(capacity)`.
```java
class LRUCache extends LinkedHashMap<Integer, Integer> {
    private final int capacity;

    public LRUCache(int capacity) {
        super(capacity, 0.75f, true); // accessOrder = true reorders on access
        this.capacity = capacity;
    }

    public int get(int key) {
        return super.getOrDefault(key, -1);
    }

    public void put(int key, int value) {
        super.put(key, value);
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
        return size() > capacity;
    }
}
```

## Key Takeaways
- Two sentinel nodes (head/tail) remove every edge-case check for empty lists or removing the first/last real node.
- The map stores `key -> node` (not `key -> value`) so a `get` can locate the node in O(1) and reposition it in the list in O(1).
- `LinkedHashMap` with `accessOrder=true` + `removeEldestEntry` override is a legitimate one-liner solution — know both, since interviewers often want the manual version to prove you understand the mechanics.
- Related: LFU Cache (adds frequency tracking on top of this recency structure), Design a Data Structure with O(1) insert/delete/getRandom.
