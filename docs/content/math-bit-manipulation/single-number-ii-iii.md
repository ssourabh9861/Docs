# Single Number II / III

**Difficulty:** Hard · **Pattern:** bit-width counting and XOR-based splitting to isolate elements that appear an odd/different number of times · [LeetCode](https://leetcode.com/problems/single-number-ii/) / [LeetCode](https://leetcode.com/problems/single-number-iii/)

## Problem
**Single Number II**: every element in an array appears exactly three times except one which appears once — find that one element in O(n) time, O(1) space.
**Single Number III**: every element appears exactly twice except two elements which appear once each — find both of those elements in O(n) time, O(1) space.

## Examples
**Example 1 (II)**
```
Input:  nums = [2,2,3,2]
Output: 3
Explanation: 2 appears three times, 3 appears once.
```

**Example 2 (III)**
```
Input:  nums = [1,2,1,3,2,5]
Output: [3,5]
Explanation: 3 and 5 each appear once; 1 and 2 each appear twice. Order of output doesn't matter.
```

## Constraints
- 1 <= nums.length <= 3 * 10^4 (II) / 2 <= nums.length <= 3 * 10^4 (III)
- -2^31 <= nums[i] <= 2^31 - 1
- II: exactly one element appears once, all others exactly three times.
- III: exactly two elements appear once, all others exactly twice.

## Approach 1 — Bit-count mod 3 (Single Number II, straightforward)
**Idea.** For each of the 32 bit positions, sum that bit across all numbers. If every repeated element appears 3 times, the total count of set bits at a position is a multiple of 3 plus possibly 1 (from the unique element). Taking `count % 3` recovers the unique element's bit at that position.
**Complexity.** Time O(32n) = O(n), Space O(1).
```java
class SoluationII_Basic {
    public int singleNumber(int[] nums) {
        int result = 0;
        for (int shift = 0; shift < 32; shift++) {
            int sum = 0;
            for (int num : nums) {
                sum += (num >> shift) & 1;
            }
            if (sum % 3 != 0) {
                result |= (1 << shift);
            }
        }
        return result;
    }
}
```

## Approach 2 — Two-variable state machine (optimal, Single Number II)
**Idea.** Track `ones` and `twos`: bits currently seen exactly once and exactly twice, cycling through states 0 → seen once → seen twice → reset to 0 (mod 3 counter per bit) as each number arrives. Update order matters: compute `ones` first using the *old* `twos` (to gate out bits that just reached count 3), then compute `twos` using the *new* `ones`.
**Complexity.** Time O(n), Space O(1).
```java
class SolutionII_Optimal {
    public int singleNumber(int[] nums) {
        int ones = 0, twos = 0;
        for (int num : nums) {
            ones = (ones ^ num) & ~twos;
            twos = (twos ^ num) & ~ones;
        }
        return ones;
    }
}
```

## Approach 3 — XOR then split by lowest set bit (Single Number III)
**Idea.** XOR all numbers: pairs cancel, leaving `xorAll = a ^ b` where `a`, `b` are the two unique numbers. Since `a != b`, `xorAll != 0`; pick its lowest set bit `diff = xorAll & (-xorAll)` — this bit differs between `a` and `b`. Partition all numbers by whether that bit is set; XOR-reducing each partition isolates `a` and `b` respectively (duplicates still cancel within their partition since a number's bit value is fixed).
**Complexity.** Time O(n), Space O(1).
```java
class SolutionIII {
    public int[] singleNumber(int[] nums) {
        int xorAll = 0;
        for (int num : nums) xorAll ^= num;

        int diff = xorAll & (-xorAll); // lowest set bit

        int a = 0;
        for (int num : nums) {
            if ((num & diff) != 0) a ^= num;
        }
        int b = xorAll ^ a;

        return new int[]{a, b};
    }
}
```

## Key Takeaways
- Bit-counting mod k generalizes to "every element appears k times except one" for any k, not just 3.
- The `ones`/`twos` state machine is a compact way to simulate a base-3 counter per bit using only bitwise ops.
- XOR-then-split-by-a-differing-bit is the standard trick whenever exactly two "odd-one-out" elements must be separated after a full XOR reduction.
- `x & (-x)` isolates the lowest set bit of `x` — memorize this idiom, it recurs across many bit-manipulation problems.
