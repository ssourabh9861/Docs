# The Skyline Problem

**Difficulty:** Hard · **Pattern:** sweep-line over critical x-coordinates + max-heap of active heights · [LeetCode](https://leetcode.com/problems/the-skyline-problem/)

## Problem
Given buildings as triples `[left, right, height]`, compute the skyline formed by their silhouette: a list of "key points" `[x, height]` in x-order, where each point marks where the skyline's height changes, ending with height 0.

## Examples
**Example 1**
```
Input:  buildings = [[2,9,10],[3,7,15],[5,12,12],[15,20,10],[19,24,8]]
Output: [[2,10],[3,15],[7,12],[12,0],[15,10],[20,8],[24,0]]
Explanation: At x=2 height jumps to 10; at x=3 the taller building raises it to 15; at x=7 building 2 ends, dropping to the next-tallest active building (12); etc.
```

**Example 2**
```
Input:  buildings = [[0,2,3],[2,5,3]]
Output: [[0,3],[5,0]]
Explanation: Adjacent buildings of equal height merge into one continuous skyline segment, so no key point is emitted at x=2.
```

## Constraints
- 1 <= buildings.length <= 10^4
- 0 <= left[i] < right[i] <= 2^31 - 1, 1 <= height[i] <= 2^31 - 1

## Approach 1 — Sweep-line with events + max-heap of active heights (classic)
**Idea.** Convert each building into two events: a "start" event at `left` with `+height`, and an "end" event at `right` with `-height`. Sort events by x; for ties, process starts before ends unless it changes the max incorrectly — the robust way is to sort by x, and for equal x, order start events by descending height before end events, and end events by ascending height, so no incorrect intermediate point is ever emitted. Sweep left to right, maintaining a max-heap of active heights with lazy deletion (a count map tracks how many times each height should be removed). At each distinct x, after applying all events at that x, compare the new max height to the last emitted height; if different, emit `[x, newMax]`.
**Complexity.** Time O(n log n), Space O(n).
```java
class Solution {
    public List<List<Integer>> getSkyline(int[][] buildings) {
        // events: [x, height] where height > 0 means "start" (add), height < 0 means "end" (remove)
        int n = buildings.length;
        int[][] events = new int[2 * n][2];
        for (int i = 0; i < n; i++) {
            events[2 * i] = new int[]{buildings[i][0], buildings[i][2]};   // start: +h
            events[2 * i + 1] = new int[]{buildings[i][1], -buildings[i][2]}; // end: -h
        }

        Arrays.sort(events, (a, b) -> {
            if (a[0] != b[0]) return Integer.compare(a[0], b[0]);
            return Integer.compare(b[1], a[1]); // starts (positive, larger first) before ends
        });

        TreeMap<Integer, Integer> active = new TreeMap<>(); // height -> count, sorted ascending
        active.put(0, 1); // ground level, always "active"
        List<List<Integer>> result = new ArrayList<>();
        int prevMax = 0;

        int i = 0;
        while (i < events.length) {
            int x = events[i][0];
            while (i < events.length && events[i][0] == x) {
                int h = events[i][1];
                if (h > 0) {
                    active.merge(h, 1, Integer::sum);
                } else {
                    int height = -h;
                    int count = active.get(height);
                    if (count == 1) active.remove(height);
                    else active.put(height, count - 1);
                }
                i++;
            }
            int currentMax = active.lastKey();
            if (currentMax != prevMax) {
                result.add(Arrays.asList(x, currentMax));
                prevMax = currentMax;
            }
        }
        return result;
    }
}
```

## Approach 2 — Divide and conquer, merging skylines like merge sort (optimal alternative)
**Idea.** Recursively split the buildings into two halves, compute each half's skyline independently, then merge the two skylines the way merge-sort merges two sorted lists: sweep both skyline sequences together, at each step tracking the current height contributed by each side, and emit a new key point whenever `max(leftHeight, rightHeight)` changes. This avoids the heap entirely and is a natural "merge two skylines" recursion.
**Complexity.** Time O(n log n) (T(n) = 2T(n/2) + O(n) merge), Space O(n).
```java
class Solution {
    public List<List<Integer>> getSkyline(int[][] buildings) {
        return divide(buildings, 0, buildings.length - 1);
    }

    private List<List<Integer>> divide(int[][] buildings, int lo, int hi) {
        if (lo > hi) return new ArrayList<>();
        if (lo == hi) {
            List<List<Integer>> single = new ArrayList<>();
            int[] b = buildings[lo];
            single.add(Arrays.asList(b[0], b[2]));
            single.add(Arrays.asList(b[1], 0));
            return single;
        }
        int mid = lo + (hi - lo) / 2;
        List<List<Integer>> left = divide(buildings, lo, mid);
        List<List<Integer>> right = divide(buildings, mid + 1, hi);
        return merge(left, right);
    }

    private List<List<Integer>> merge(List<List<Integer>> left, List<List<Integer>> right) {
        List<List<Integer>> result = new ArrayList<>();
        int i = 0, j = 0;
        int heightLeft = 0, heightRight = 0;
        int prevMax = 0;

        while (i < left.size() && j < right.size()) {
            int x;
            if (left.get(i).get(0) < right.get(j).get(0)) {
                x = left.get(i).get(0);
                heightLeft = left.get(i).get(1);
                i++;
            } else if (left.get(i).get(0) > right.get(j).get(0)) {
                x = right.get(j).get(0);
                heightRight = right.get(j).get(1);
                j++;
            } else {
                x = left.get(i).get(0);
                heightLeft = left.get(i).get(1);
                heightRight = right.get(j).get(1);
                i++;
                j++;
            }
            int currentMax = Math.max(heightLeft, heightRight);
            if (currentMax != prevMax) {
                result.add(Arrays.asList(x, currentMax));
                prevMax = currentMax;
            }
        }
        appendRemaining(left, i, result);
        appendRemaining(right, j, result);
        return result;
    }

    private void appendRemaining(List<List<Integer>> list, int start, List<List<Integer>> result) {
        for (int k = start; k < list.size(); k++) {
            int x = list.get(k).get(0);
            int h = list.get(k).get(1);
            if (result.isEmpty() || !result.get(result.size() - 1).get(1).equals(h)) {
                result.add(Arrays.asList(x, h));
            }
        }
    }
}
```

## Key Takeaways
- The core insight is: at every x-coordinate, the skyline height is the max of all currently-active building heights — a sweep-line + "max of active set" problem, same family as Meeting Rooms II but tracking max instead of count.
- Event ordering at tied x matters: process all starts (tallest first) before ends at the same x to avoid emitting spurious dips.
- Lazy-deletion max-heap (or a `TreeMap<height, count>` used as a multiset, as above) is the standard way to support "remove an arbitrary active height" efficiently; the divide-and-conquer merge avoids this bookkeeping entirely by merging two already-correct skylines directly.
