# Basic Calculator I / II / III

**Difficulty:** Hard · **Pattern:** Stack-based expression evaluation (operator precedence + parentheses recursion) · [LeetCode](https://leetcode.com/problems/basic-calculator/)

## Problem
Implement a basic calculator to evaluate a string expression:
- **Basic Calculator I:** expression contains `+`, `-`, `(`, `)`, non-negative integers, and spaces (no `*`/`/`).
- **Basic Calculator II:** expression contains `+`, `-`, `*`, `/`, non-negative integers, and spaces (no parentheses).
- **Basic Calculator III:** the general case — `+`, `-`, `*`, `/`, `(`, `)`, non-negative integers, and spaces, with standard operator precedence.
All three variants assume the expression is always valid and integer division truncates toward zero.

## Examples
**Example 1 (Calculator I)**
```
Input:  s = "(1+(4+5+2)-3)+(6+8)"
Output: 23
```

**Example 2 (Calculator II)**
```
Input:  s = "3+2*2"
Output: 7
```

**Example 3 (Calculator III)**
```
Input:  s = "2*(5+5*2)/3+(6/2+8)"
Output: 21
```

## Constraints
- `1 <= s.length <= 3 * 10^5`
- `s` consists of digits, `'+'`, `'-'`, `'*'`, `'/'`, `'('`, `')'`, and `' '`.
- `s` represents a valid expression.
- All intermediate results and the final answer fit in a 32-bit signed integer for II/III; for I, `2^31 <= answer <= 2^31 - 1` per LeetCode's stated bound.
- `'+'` is never used as a unary operator (no leading `+5`); `'-'` may be used as a unary operator, but only for the first term or a term right after `(`.
- Division truncates toward zero, and denominators are never zero.

## Approach 1 — Calculator I: sign-and-stack for `+ - ( )`
**Idea.** Track a running `result`, the `sign` to apply to the next number (`+1`/`-1`), and a stack that stores `(priorResult, priorSign)` pairs to restore state across parentheses. On `(`, push current result/sign and reset; on `)`, pop and fold the completed sub-expression back into the outer context. This avoids recursion by treating the stack as an explicit call stack for nested parens.
**Complexity.** Time O(n), Space O(n) for the stack (nesting depth).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int calculate(String s) {
        Deque<Integer> stack = new ArrayDeque<>();
        int result = 0;
        int number = 0;
        int sign = 1;

        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isDigit(c)) {
                number = number * 10 + (c - '0');
            } else if (c == '+') {
                result += sign * number;
                number = 0;
                sign = 1;
            } else if (c == '-') {
                result += sign * number;
                number = 0;
                sign = -1;
            } else if (c == '(') {
                stack.push(result);
                stack.push(sign);
                result = 0;
                sign = 1;
            } else if (c == ')') {
                result += sign * number;
                number = 0;
                result *= stack.pop();  // sign before '('
                result += stack.pop();  // result before '('
            }
            // spaces are ignored
        }
        result += sign * number;
        return result;
    }
}
```

## Approach 2 — Calculator II: single stack for `+ - * /` precedence
**Idea.** Without parentheses, precedence can be resolved in one left-to-right pass using a stack of signed operands. Track the previous operator seen; when a number is complete, act based on that previous operator: push it (`+`), push its negation (`-`), or pop-multiply/pop-divide-then-push (`*`/`/`) — this immediately resolves high-precedence operations while leaving `+`/`-` operands for a final sum.
**Complexity.** Time O(n), Space O(n).
```java
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    public int calculate(String s) {
        Deque<Integer> stack = new ArrayDeque<>();
        int number = 0;
        char prevOp = '+';

        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isDigit(c)) {
                number = number * 10 + (c - '0');
            }
            if ((!Character.isDigit(c) && c != ' ') || i == s.length() - 1) {
                switch (prevOp) {
                    case '+' -> stack.push(number);
                    case '-' -> stack.push(-number);
                    case '*' -> stack.push(stack.pop() * number);
                    case '/' -> stack.push(stack.pop() / number); // truncates toward zero in Java
                }
                prevOp = c;
                number = 0;
            }
        }

        int total = 0;
        for (int v : stack) total += v;
        return total;
    }
}
```

## Approach 3 — Calculator III: recursive-descent over the full grammar (optimal / general case)
**Idea.** Handle the general grammar `expr = term (('+'|'-') term)*`, `term = factor (('*'|'/') factor)*`, `factor = number | '(' expr ')'` with mutual recursion driven by a shared character index. On `(`, recurse into `calculate` for the sub-expression, then continue at the returned index. This single approach subsumes Calculator I and II — it is the general recursive-descent expression evaluator taught in compilers, specialized to arithmetic with parentheses and standard precedence.
**Complexity.** Time O(n), Space O(n) recursion depth for nested parentheses.
```java
class Solution {
    private int index = 0;

    public int calculate(String s) {
        index = 0;
        return parseExpression(s);
    }

    // expr = term (('+' | '-') term)*
    private int parseExpression(String s) {
        int result = parseTerm(s);
        while (index < s.length()) {
            skipSpaces(s);
            if (index >= s.length() || (s.charAt(index) != '+' && s.charAt(index) != '-')) break;
            char op = s.charAt(index++);
            int next = parseTerm(s);
            result += (op == '+') ? next : -next;
        }
        return result;
    }

    // term = factor (('*' | '/') factor)*
    private int parseTerm(String s) {
        int result = parseFactor(s);
        while (true) {
            skipSpaces(s);
            if (index >= s.length() || (s.charAt(index) != '*' && s.charAt(index) != '/')) break;
            char op = s.charAt(index++);
            int next = parseFactor(s);
            result = (op == '*') ? result * next : result / next;
        }
        return result;
    }

    // factor = number | '(' expr ')' | '-' factor
    private int parseFactor(String s) {
        skipSpaces(s);
        if (s.charAt(index) == '-') {
            index++;
            return -parseFactor(s);
        }
        if (s.charAt(index) == '(') {
            index++; // consume '('
            int value = parseExpression(s);
            skipSpaces(s);
            index++; // consume ')'
            return value;
        }
        int start = index;
        while (index < s.length() && Character.isDigit(s.charAt(index))) index++;
        return Integer.parseInt(s.substring(start, index));
    }

    private void skipSpaces(String s) {
        while (index < s.length() && s.charAt(index) == ' ') index++;
    }
}
```

## Key Takeaways
- Calculator I's stack stores `(result, sign)` snapshots per open paren, acting as an explicit call stack that avoids recursion.
- Calculator II resolves `*`/`/` eagerly against the previous operand on the stack, deferring only `+`/`-` to a final sum — this exploits that multiplication/division bind tighter without needing full precedence climbing.
- Calculator III's recursive-descent parser (`expr -> term -> factor`) generalizes both: it is the standard technique for any expression grammar with precedence and parentheses, and can replace Calculator I/II implementations entirely at the cost of slightly more code.
- Java's `/` on ints already truncates toward zero, matching the problems' required rounding behavior — no extra handling needed for negative operands.
