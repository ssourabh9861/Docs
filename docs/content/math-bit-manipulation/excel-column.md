# Excel Sheet Column Title / Number

**Difficulty:** Medium · **Pattern:** Base-26 conversion with 1-indexed, no-zero digits (bijective base-26) · [LeetCode](https://leetcode.com/problems/excel-sheet-column-title/)

## Problem
Two related conversions between Excel-style column labels and integers:
1. **Column Title:** given a positive integer `columnNumber`, return its corresponding Excel column title (e.g. `1 -> "A"`, `28 -> "AB"`).
2. **Column Number:** given a column title string, return its corresponding integer value (e.g. `"AB" -> 28"`).

The tricky part is that this is *bijective* base-26 (digits `1..26` map to `A..Z`), not standard base-26 (digits `0..25`), because there is no symbol for zero — after `Z` comes `AA`, not a "digit reset with carry" the way base-10 works after `9`.

## Examples
**Example 1**
```
Input:  columnNumber = 1
Output: "A"
```

**Example 2**
```
Input:  columnNumber = 28
Output: "AB"
Explanation: 28 = 26 + 2 -> after Z (26), the sequence continues AA(27), AB(28).
```

**Example 3 (reverse direction)**
```
Input:  columnTitle = "ZY"
Output: 701
Explanation: 26*26 + 25 = 676 + 25 = 701
```

## Constraints
- `1 <= columnNumber <= 2^31 - 1`
- `1 <= columnTitle.length <= 7`
- `columnTitle` consists only of uppercase English letters.
- `columnTitle` is guaranteed to be in the range `[1, 2^31 - 1]`.

## Approach 1 — Number to Title: repeated subtract-and-mod
**Idea.** In bijective base-26, letters correspond to remainders `1..26`, not `0..25`. When `columnNumber % 26 == 0`, that position is `'Z'` and we must borrow 1 before dividing, otherwise the standard `%`/`/` step breaks (would try to represent digit 0, which doesn't exist). Concretely: decrement by 1 first so the remainder range becomes `0..25`, mapping cleanly to `'A'..'Z'`.
**Complexity.** Time O(log₂₆ n), Space O(log₂₆ n) for the output string.
```java
class Solution {
    public String convertToTitle(int columnNumber) {
        StringBuilder sb = new StringBuilder();
        while (columnNumber > 0) {
            columnNumber--;                 // shift range from [1,26] to [0,25]
            int digit = columnNumber % 26;
            sb.append((char) ('A' + digit));
            columnNumber /= 26;
        }
        return sb.reverse().toString();
    }
}
```

## Approach 2 — Title to Number: Horner's rule (optimal)
**Idea.** Process characters left to right, treating the string as a base-26 number where each letter contributes value `1..26`: `result = result * 26 + (c - 'A' + 1)`. This is the standard Horner's method used for any base conversion and naturally handles the bijective (no-zero) property because each digit value is already `1..26`.
**Complexity.** Time O(L) where L is string length, Space O(1).
```java
class Solution {
    public int titleToNumber(String columnTitle) {
        int result = 0;
        for (char c : columnTitle.toCharArray()) {
            int digit = c - 'A' + 1;
            result = result * 26 + digit;
        }
        return result;
    }
}
```

## Key Takeaways
- This is bijective base-26 (digits 1–26, no zero symbol), so the "decrement before mod" trick is essential when converting number-to-title — plain `% 26` alone misclassifies multiples of 26.
- Title-to-number is a direct Horner's-rule polynomial evaluation, identical in shape to parsing any base-N string.
- Both directions run in time proportional to the number of letters (at most 7 for the given constraints, since 26^7 exceeds `int` range).
