# Range Module

**Difficulty:** Hard · **Pattern:** TreeMap of disjoint half-open intervals, split/merge on add/remove · [LeetCode](https://leetcode.com/problems/range-module/)

## Problem
Design a module tracking ranges of numbers, supporting `addRange(left, right)` (mark half-open interval `[left, right)` as tracked, merging with adjacent/overlapping ranges), `queryRange(left, right)` (return whether every real number in `[left, right)` is currently tracked), and `removeRange(left, right)` (unmark `[left, right)`, splitting ranges as needed).

## Examples
**Example 1**
```
Input:
["RangeModule","addRange","removeRange","queryRange","queryRange","queryRange"]
[[],[10,20],[14,16],[10,14],[13,15],[16,17]]
Output:
[null,null,null,true,false,true]
Explanation: addRange(10,20) tracks [10,20). removeRange(14,16) unmarks [14,16), leaving [10,14) and [16,20) tracked.
queryRange(10,14) -> true (fully within [10,14)). queryRange(13,15) -> false (15 is in the removed gap).
queryRange(16,17) -> true (within [16,20)).
```

## Constraints
- 1 <= left < right <= 10^9
- At most 10^4 calls total to addRange, queryRange, removeRange.

## Approach 1 — TreeMap<start, end> of disjoint tracked ranges (optimal)
**Idea.** Store tracked ranges as a `TreeMap<Integer, Integer>` mapping each range's start to its (exclusive) end, always kept disjoint and non-adjacent (adjacent ranges get merged). 
- **addRange(left, right):** find all existing ranges that overlap or touch `[left, right)` — start from `floorEntry(left)` if it overlaps, walk forward while `higherEntry`'s start <= right — extend `[left, right)` to cover them, remove the absorbed entries, then insert the merged range.
- **removeRange(left, right):** find overlapping ranges similarly; for each, if it pokes out on the left keep `[rangeStart, left)`, if it pokes out on the right keep `[right, rangeEnd)`; remove the original and reinsert the surviving pieces.
- **queryRange(left, right):** find `floorEntry(left)`; it must exist and satisfy `entry.start <= left && entry.end >= right`.
**Complexity.** Time O(log n) amortized-ish per call dominated by TreeMap navigation (each call touches O(k) overlapping ranges, k amortized small), Space O(n) for n disjoint tracked ranges.
```java
class RangeModule {
    private final TreeMap<Integer, Integer> ranges; // start -> end (exclusive)

    public RangeModule() {
        ranges = new TreeMap<>();
    }

    public void addRange(int left, int right) {
        // Start point: does a range starting before 'left' already reach into it?
        Map.Entry<Integer, Integer> floor = ranges.floorEntry(left);
        if (floor != null && floor.getValue() >= left) {
            left = Math.min(left, floor.getKey());
        }

        // Absorb every range that overlaps or touches [left, right]
        Map.Entry<Integer, Integer> entry = ranges.ceilingEntry(left);
        while (entry != null && entry.getKey() <= right) {
            right = Math.max(right, entry.getValue());
            ranges.remove(entry.getKey());
            entry = ranges.ceilingEntry(left);
        }

        ranges.put(left, right);
    }

    public boolean queryRange(int left, int right) {
        Map.Entry<Integer, Integer> floor = ranges.floorEntry(left);
        return floor != null && floor.getValue() >= right;
    }

    public void removeRange(int left, int right) {
        Map.Entry<Integer, Integer> floor = ranges.floorEntry(left);
        if (floor != null && floor.getValue() > left) {
            // this range overlaps [left, ...); it may extend past 'right' too
            if (floor.getValue() > right) {
                ranges.put(right, floor.getValue()); // keep the right remainder
            }
            if (floor.getKey() < left) {
                ranges.put(floor.getKey(), left); // keep the left remainder
            } else {
                ranges.remove(floor.getKey());
            }
        }

        Map.Entry<Integer, Integer> entry = ranges.ceilingEntry(left);
        while (entry != null && entry.getKey() < right) {
            if (entry.getValue() > right) {
                ranges.put(right, entry.getValue()); // keep remainder past 'right'
            }
            ranges.remove(entry.getKey());
            entry = ranges.ceilingEntry(left);
        }
    }
}
```

## Approach 2 — Sorted list + binary search (conceptually equivalent, manual pointer bookkeeping)
**Idea.** Instead of a TreeMap, keep two parallel `ArrayList<Integer>` (or a flat sorted list of alternating start/end "boundary" values) for starts and ends, and use `Collections.binarySearch` to locate insertion points. The logic mirrors Approach 1 exactly (find overlap window, merge/split, splice the list), but list insertions/removals are O(n) shifts instead of O(log n) tree operations, making this strictly worse asymptotically — useful mainly to show the same idea without relying on TreeMap's entry navigation API.
**Complexity.** Time O(n) per call due to list splicing, Space O(n).
```java
class RangeModule {
    private final List<int[]> ranges = new ArrayList<>(); // sorted, disjoint, non-adjacent [start, end)

    public RangeModule() {}

    public void addRange(int left, int right) {
        List<int[]> merged = new ArrayList<>();
        int i = 0, n = ranges.size();
        while (i < n && ranges.get(i)[1] < left) {
            merged.add(ranges.get(i++));
        }
        while (i < n && ranges.get(i)[0] <= right) {
            left = Math.min(left, ranges.get(i)[0]);
            right = Math.max(right, ranges.get(i)[1]);
            i++;
        }
        merged.add(new int[]{left, right});
        while (i < n) {
            merged.add(ranges.get(i++));
        }
        ranges.clear();
        ranges.addAll(merged);
    }

    public boolean queryRange(int left, int right) {
        for (int[] r : ranges) {
            if (r[0] <= left && right <= r[1]) return true;
            if (r[0] > left) break;
        }
        return false;
    }

    public void removeRange(int left, int right) {
        List<int[]> result = new ArrayList<>();
        for (int[] r : ranges) {
            if (r[1] <= left || r[0] >= right) {
                result.add(r); // no overlap
                continue;
            }
            if (r[0] < left) {
                result.add(new int[]{r[0], left});
            }
            if (r[1] > right) {
                result.add(new int[]{right, r[1]});
            }
        }
        ranges.clear();
        ranges.addAll(result);
    }
}
```

## Key Takeaways
- Model tracked ranges as disjoint, non-adjacent half-open intervals in a `TreeMap<start, end>`; `floorEntry`/`ceilingEntry` give the neighbors needed to merge on add and split on remove.
- `addRange` and `removeRange` are mirror images: one absorbs/extends overlapping ranges, the other carves overlapping ranges down to their non-overlapping remainders.
- `queryRange` reduces to a single `floorEntry` lookup — no need to scan, since ranges are disjoint and sorted, the containing range (if any) must start at or before `left`.
