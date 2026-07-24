# Expression Add Operators

**Difficulty:** Hard · **Pattern:** DFS over split points with running-value and last-operand tracking · [LeetCode](https://leetcode.com/problems/expression-add-operators/)

## Problem
Given a string `num` containing only digits and an integer `target`, return all ways to insert the binary operators `+`, `-`, and `*` between the digits so the resulting expression evaluates to `target`. Numbers in the expression cannot have leading zeros (unless the number itself is exactly `"0"`).

## Examples
**Example 1**
```
Input:  num = "123", target = 6
Output: ["1+2+3","1*2*3"]
Explanation: Both expressions evaluate to 6.
```
**Example 2**
```
Input:  num = "105", target = 5
Output: ["1*0+5","10-5"]
Explanation: "105" alone isn't 5, but splitting as 1*0+5 or 10-5 both work; note "1*05" is invalid (leading zero on "05").
```

## Constraints
- `1 <= num.length <= 10`
- `num` consists of digits only
- `-2^31 <= target <= 2^31 - 1`

## Approach 1 — DFS trying every split and every operator
**Idea.** At each position, try every possible next "number" substring (respecting the no-leading-zero rule), and for each, try appending it with `+`, `-`, or `*` to the expression built so far, then recurse on the remaining string. Evaluate the whole expression from scratch (or track a running total) only once the string is fully consumed. This is the most direct choose/explore/un-choose formulation: choose a split length and an operator, explore, then un-choose (backtrack the built string) before trying the next combination.
**Complexity.** Time O(4^n) in the worst case (3 operators + varying split lengths per position), Space O(n) recursion depth + O(n) per candidate expression.
```java
import java.util.*;

class Solution {
    public List<String> addOperators(String num, int target) {
        List<String> result = new ArrayList<>();
        if (num.length() == 0) return result;
        dfs(num, target, 0, new StringBuilder(), result);
        return result;
    }

    private void dfs(String num, int target, int start, StringBuilder expr, List<String> result) {
        if (start == num.length()) {
            if (evaluate(expr.toString()) == target) {
                result.add(expr.toString());
            }
            return;
        }
        for (int len = 1; len <= num.length() - start; len++) {
            if (len > 1 && num.charAt(start) == '0') break; // prune: leading-zero numbers invalid
            String part = num.substring(start, start + len);
            int prevLen = expr.length();
            for (char op : new char[] {'+', '-', '*'}) {
                if (expr.length() == 0 && op != '+') continue; // no leading operator before first number
                if (expr.length() == 0) {
                    expr.append(part);       // choose (first number, no operator)
                } else {
                    expr.append(op).append(part); // choose
                }
                dfs(num, target, start + len, expr, result); // explore
                expr.setLength(prevLen);     // un-choose
            }
        }
    }

    // Evaluates the built expression left-to-right, honoring '*' precedence via a stack
    // (push +num, push -num, or multiply into the top of the stack), then sums the stack.
    private long evaluate(String expr) {
        Deque<Long> stack = new ArrayDeque<>();
        long num = 0;
        char sign = '+';
        for (int i = 0; i < expr.length(); i++) {
            char c = expr.charAt(i);
            if (Character.isDigit(c)) {
                num = num * 10 + (c - '0');
            }
            boolean isLast = i == expr.length() - 1;
            if ((!Character.isDigit(c) && c != ' ') || isLast) {
                if (sign == '+') stack.push(num);
                else if (sign == '-') stack.push(-num);
                else if (sign == '*') stack.push(stack.pop() * num);
                sign = c;
                num = 0;
            }
        }
        long total = 0;
        for (long v : stack) total += v;
        return total;
    }
}
```

## Approach 2 — DFS tracking running value + last operand (optimal / pruned)
**Idea.** Avoid re-evaluating the whole expression string at every leaf by carrying two running numbers through the recursion: `value` (the expression's total so far) and `lastOperand` (the last term added, needed to correctly "undo and redo" for `*` since multiplication has higher precedence than the running sum). When appending a new number `cur` with:
- `+`: `newValue = value + cur`, `newLast = cur`
- `-`: `newValue = value - cur`, `newLast = -cur`
- `*`: `newValue = value - lastOperand + lastOperand * cur`, `newLast = lastOperand * cur` (undo the last operand's simple addition, redo it multiplied by `cur`)

This is the standard optimal technique for this problem, turning an O(n) re-evaluation per candidate into O(1) incremental updates. The leading-zero prune and split-length loop are identical to Approach 1.
**Complexity.** Time O(4^n) worst case (same branching factor) but with O(1) work per node instead of O(n), Space O(n) recursion + O(n) per output string.
```java
import java.util.*;

class Solution {
    private String num;
    private int target;
    private List<String> result;

    public List<String> addOperators(String num, int target) {
        this.num = num;
        this.target = target;
        this.result = new ArrayList<>();
        if (num.length() == 0) return result;
        dfs(0, new StringBuilder(), 0L, 0L);
        return result;
    }

    private void dfs(int start, StringBuilder expr, long value, long lastOperand) {
        if (start == num.length()) {
            if (value == target) result.add(expr.toString());
            return;
        }
        for (int len = 1; len <= num.length() - start; len++) {
            if (len > 1 && num.charAt(start) == '0') break; // prune: leading zero
            String part = num.substring(start, start + len);
            long cur = Long.parseLong(part);
            int prevLen = expr.length();

            if (start == 0) {
                // first number: no operator
                expr.append(part);
                dfs(start + len, expr, cur, cur);
                expr.setLength(prevLen);
            } else {
                // '+'
                expr.append('+').append(part);
                dfs(start + len, expr, value + cur, cur);
                expr.setLength(prevLen);

                // '-'
                expr.append('-').append(part);
                dfs(start + len, expr, value - cur, -cur);
                expr.setLength(prevLen);

                // '*'
                expr.append('*').append(part);
                dfs(start + len, expr, value - lastOperand + lastOperand * cur, lastOperand * cur);
                expr.setLength(prevLen);
            }
        }
    }
}
```

## Key Takeaways
- The "choose" step here is two-dimensional: choose how many digits form the next number (respecting no-leading-zeros) *and* which operator glues it to the expression — both loops need their own un-choose (`expr.setLength(prevLen)`).
- Re-evaluating the whole expression string at every leaf (Approach 1) is correct but wasteful; carrying `(value, lastOperand)` through the recursion (Approach 2) makes each step O(1) and is the standard optimal technique.
- The multiplication case is the subtle part: because `*` binds tighter than `+`/`-`, you must "undo" the last additive term and "redo" it multiplied — `value - lastOperand + lastOperand * cur`.
- Leading-zero pruning (`if (len > 1 && num.charAt(start) == '0') break;`) must use `break`, not `continue`, since all longer splits starting with a zero digit are equally invalid.
