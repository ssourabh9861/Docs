# Bitwise AND of Numbers Range

**Difficulty:** Medium · **Pattern:** the AND of a range collapses to the common binary prefix of the two endpoints, found by shifting both right in lockstep · [LeetCode](https://leetcode.com/problems/bitwise-and-of-numbers-range/)

## Problem
Given two integers `left` and `right` that represent the range `[left, right]`, return the bitwise AND of all numbers in this range, inclusive.

## Examples
**Example 1**
```
Input:  left = 5, right = 7
Output: 4
Explanation: 5=101, 6=110, 7=111; AND of all three = 100 = 4.
```

**Example 2**
```
Input:  left = 0, right = 0
Output: 0
```

**Example 3**
```
Input:  left = 1, right = 2147483647
Output: 0
Explanation: The range spans a bit flip at every position, so every bit gets zeroed by some number in range.
```

## Constraints
- 0 <= left <= right <= 2^31 - 1

## Approach 1 — Shift-until-equal (find common prefix)
**Idea.** As soon as `left != right`, there must be some number in between whose bits differ from both at the lowest differing position, so any bit that flips somewhere in the range gets ANDed to 0. Only the *common leading prefix* of `left` and `right` survives. Repeatedly right-shift both numbers together (dropping the trailing bits that are guaranteed to be zeroed) until they become equal, counting the shifts, then shift that common value back left by the same amount.
**Complexity.** Time O(32) = O(1), Space O(1).
```java
class SolutionShiftPrefix {
    public int rangeBitwiseAnd(int left, int right) {
        int shift = 0;
        while (left != right) {
            left >>= 1;
            right >>= 1;
            shift++;
        }
        return left << shift;
    }
}
```

## Approach 2 — Turn off the lowest set bit of right (equivalent, optimal)
**Idea.** Repeatedly clear the lowest set bit of `right` using `right &= (right - 1)` until `right <= left`. Each clear removes a bit that is guaranteed to be zeroed anyway (since a smaller number in range differs there), and stopping once `right <= left` (with `right` no longer exceeding `left`, so `right` becomes exactly the shared prefix) yields the same common-prefix result without an explicit shift counter.
**Complexity.** Time O(32) = O(1) in the worst case, Space O(1).
```java
class SolutionClearLowBit {
    public int rangeBitwiseAnd(int left, int right) {
        while (left < right) {
            right &= (right - 1); // clear the lowest set bit
        }
        return right;
    }
}
```

## Key Takeaways
- The AND of an entire range reduces to the common binary prefix shared by `left` and `right`; any bit position where they differ is guaranteed to be zeroed by some intermediate value.
- Shifting both endpoints right together until equal is a clean way to locate that common prefix, then shifting back restores its original bit positions.
- `right &= (right - 1)` clears the lowest set bit — the same idiom used in `Integer.bitCount`-style popcount loops, reused here to strip bits until reaching the shared prefix.
- Both approaches run in a small constant number of iterations (at most 31), never a scan of the whole numeric range.
