# Sum of Two Integers

**Difficulty:** Medium · **Pattern:** simulate binary addition with XOR (sum without carry) and AND+shift (carry), without using + or - · [LeetCode](https://leetcode.com/problems/sum-of-two-integers/)

## Problem
Given two integers `a` and `b`, return their sum without using the operators `+` or `-`.

## Examples
**Example 1**
```
Input:  a = 1, b = 2
Output: 3
```

**Example 2**
```
Input:  a = 2, b = 3
Output: 5
```

## Constraints
- -1000 <= a, b <= 1000

## Approach 1 — Iterative XOR/carry loop
**Idea.** In binary addition, `a XOR b` gives the sum of each bit ignoring carry, and `(a AND b) << 1` gives the carry generated at each position. Repeat: set `b` to the carry, `a` to the no-carry sum, until there's no carry left. Java's `int` is 32-bit two's complement, so this loop naturally handles negative numbers too — no special-casing needed.
**Complexity.** Time O(32) = O(1), Space O(1).
```java
class Solution {
    public int getSum(int a, int b) {
        while (b != 0) {
            int sumNoCarry = a ^ b;
            int carry = (a & b) << 1;
            a = sumNoCarry;
            b = carry;
        }
        return a;
    }
}
```

## Approach 2 — Recursive formulation (same idea, optimal)
**Idea.** Identical mathematics expressed recursively: the sum equals `getSum(a ^ b, (a & b) << 1)`, terminating when the carry (`b`) becomes zero. Purely a stylistic variant of Approach 1 with identical complexity; some interviewers prefer seeing the recursive form to make the "sum + carry, recurse" structure explicit.
**Complexity.** Time O(32) = O(1) (bounded recursion depth), Space O(32) recursion stack = O(1).
```java
class SolutionRecursive {
    public int getSum(int a, int b) {
        if (b == 0) return a;
        int sumNoCarry = a ^ b;
        int carry = (a & b) << 1;
        return getSum(sumNoCarry, carry);
    }
}
```

## Key Takeaways
- XOR performs bitwise addition without carry propagation; AND followed by a left shift produces exactly the carry bits.
- Looping "sum = a^b, carry = (a&b)<<1" until carry is 0 is the general blueprint for binary addition without arithmetic operators.
- Relying on fixed-width (32-bit) two's-complement overflow behavior means the loop terminates naturally and handles negatives correctly in Java.
- This pattern (XOR for sum, AND+shift for carry) also underlies full-adder circuit design in hardware.
