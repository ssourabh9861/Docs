# Data Stream as Disjoint Intervals

**Difficulty:** Hard · **Pattern:** TreeMap keyed by interval start, merge neighbors on insert · [LeetCode](https://leetcode.com/problems/data-stream-as-disjoint-intervals/)

## Problem
Design a class that receives a stream of integers (each `addNum(val)`) and, at any point, returns (`getIntervals()`) the current disjoint intervals covering all numbers seen so far, sorted by start.

## Examples
**Example 1**
```
Input:
["SummaryRanges","addNum","getIntervals","addNum","getIntervals","addNum","getIntervals","addNum","getIntervals","addNum","getIntervals"]
[[],[1],[],[3],[],[7],[],[2],[],[6],[]]
Output:
[null,null,[[1,1]],null,[[1,1],[3,3]],null,[[1,1],[3,3],[7,7]],null,[[1,3],[7,7]],null,[[1,3],[6,7]]]
Explanation: Adding 2 merges [1,1] and [3,3] into [1,3]; adding 6 merges [7,7] into [6,7].
```

## Constraints
- 0 <= val <= 10^4
- At most 3*10^4 calls will be made to addNum and getIntervals.

## Approach 1 — TreeMap keyed by interval start, merge on the fly (optimal)
**Idea.** Maintain a `TreeMap<Integer, Integer>` mapping each interval's start to its end, so intervals are always sorted and disjoint. On `addNum(val)`, use `floorEntry(val)` and `ceilingEntry(val)` to find the interval immediately before and after val. If val already falls inside the floor interval, do nothing. Otherwise check whether val glues the floor interval's end (floorEnd + 1 == val) and/or the ceiling interval's start (ceilingStart - 1 == val) into one merged interval; update/remove entries accordingly, or insert a fresh singleton `[val, val]` if neither neighbor touches it. `getIntervals()` just reads the map's entries in order.
**Complexity.** Time O(log n) per `addNum` (TreeMap operations), O(n) for `getIntervals()`; Space O(n) for n disjoint intervals.
```java
class SummaryRanges {
    private final TreeMap<Integer, Integer> intervals; // start -> end

    public SummaryRanges() {
        intervals = new TreeMap<>();
    }

    public void addNum(int val) {
        Map.Entry<Integer, Integer> floor = intervals.floorEntry(val);
        if (floor != null && floor.getValue() >= val) {
            return; // already covered
        }

        boolean mergeWithLeft = floor != null && floor.getValue() + 1 == val;
        Map.Entry<Integer, Integer> ceiling = intervals.higherEntry(val);
        boolean mergeWithRight = ceiling != null && ceiling.getKey() - 1 == val;

        if (mergeWithLeft && mergeWithRight) {
            intervals.put(floor.getKey(), ceiling.getValue());
            intervals.remove(ceiling.getKey());
        } else if (mergeWithLeft) {
            intervals.put(floor.getKey(), val);
        } else if (mergeWithRight) {
            intervals.put(val, ceiling.getValue());
            intervals.remove(ceiling.getKey());
        } else {
            intervals.put(val, val);
        }
    }

    public int[][] getIntervals() {
        int[][] result = new int[intervals.size()][2];
        int i = 0;
        for (Map.Entry<Integer, Integer> e : intervals.entrySet()) {
            result[i][0] = e.getKey();
            result[i][1] = e.getValue();
            i++;
        }
        return result;
    }
}
```

## Approach 2 — Union-Find over value ranges (alternative when values are bounded and dense)
**Idea.** When the value domain is small and known upfront (e.g., 0..10^4), use a Union-Find (disjoint set) over indices, where `find(x)` jumps to the next unvisited slot. Adding `val` unions it with neighbors already added. Reconstructing intervals requires an extra scan, so it is less naturally incremental than the TreeMap approach, but demonstrates the interval-merging idea can also be modeled with union-find "next pointer" tricks (same family as the "First Missing Positive"-style DSU-on-array trick).
**Complexity.** Time ~O(α(n)) per union with path compression, but reconstructing sorted intervals for `getIntervals()` costs O(n); Space O(n) for the bounded domain.
```java
class SummaryRanges {
    private final TreeSet<Integer> seen = new TreeSet<>();

    public SummaryRanges() {}

    public void addNum(int val) {
        seen.add(val);
    }

    public int[][] getIntervals() {
        List<int[]> result = new ArrayList<>();
        Integer start = null, prev = null;
        for (int v : seen) {
            if (start == null) {
                start = v;
            } else if (v != prev + 1) {
                result.add(new int[]{start, prev});
                start = v;
            }
            prev = v;
        }
        if (start != null) {
            result.add(new int[]{start, prev});
        }
        return result.toArray(new int[result.size()][]);
    }
}
```

## Key Takeaways
- A `TreeMap<start, end>` is the standard structure for "maintain disjoint sorted intervals under online point insertions" — `floorEntry`/`higherEntry` give O(log n) neighbor lookups for merge decisions.
- Three merge cases to handle on insert: glue left neighbor, glue right neighbor, glue both (bridging a gap), or none (new singleton interval).
- A simpler `TreeSet` + linear `getIntervals()` scan trades faster `addNum` bookkeeping for slower reconstruction — pick based on whether `addNum` or `getIntervals()` dominates call frequency.
