# Number of Visible People in a Queue

**Difficulty:** Hard · **Pattern:** monotonic non-increasing stack scanned right-to-left, counting pops · [LeetCode](https://leetcode.com/problems/number-of-visible-people-in-a-queue/)

## Problem
`n` people stand in a queue with distinct heights `heights[i]`. Person `i` can see person `j` (`j > i`) if everyone between them is strictly shorter than **both** `heights[i]` and `heights[j]` (person `i` looks right, over the heads of shorter people, and the line of sight stops at the first person as tall or taller, whom they can still see). Return an array `answer` where `answer[i]` is the number of people person `i` can see to their right.

## Examples
**Example 1**
```
Input:  heights = [10,6,8,5,11,9]
Output: [3,1,2,1,1,0]
Explanation: Person 0 (height 10) sees person 1 (6), person 2 (8), and person 4 (11) — the
line of sight is blocked after seeing the first person >= their own height, so it stops at 4.
```

**Example 2**
```
Input:  heights = [5,1,2,3,10]
Output: [4,1,1,1,0]
```

## Constraints
- `n == heights.length`
- `1 <= n <= 10^5`
- `1 <= heights[i] <= 10^5`
- All `heights[i]` are distinct.

## Approach 1 — Brute Force
**Idea.** For each person `i`, walk right, counting every shorter person seen, and stop (counting one more) as soon as a person `>= heights[i]` is reached, or the queue ends.
**Complexity.** Time O(n^2), Space O(1) extra.
```java
class Solution {
    public int[] canSeePersonsCount(int[] heights) {
        int n = heights.length;
        int[] answer = new int[n];
        for (int i = 0; i < n; i++) {
            int count = 0;
            for (int j = i + 1; j < n; j++) {
                count++;
                if (heights[j] >= heights[i]) break;
            }
            answer[i] = count;
        }
        return answer;
    }
}
```

## Approach 2 — Monotonic Stack from the Right (optimal)
**Idea.** Scan right to left, maintaining a stack that is **non-increasing** in height from bottom to top. For person `i`, pop everyone on the stack shorter than `heights[i]` — each popped person is visible to `i` (they're shorter, so `i` sees over them). If the stack is non-empty after popping, the person now on top is also visible (they're the first one `>= heights[i]`, blocking further sight) — add one more to the count. Then push `heights[i]`.
**Complexity.** Time O(n) — each index pushed and popped once, Space O(n).
```java
class Solution {
    public int[] canSeePersonsCount(int[] heights) {
        int n = heights.length;
        int[] answer = new int[n];
        Deque<Integer> stack = new ArrayDeque<>(); // heights, non-increasing bottom to top
        for (int i = n - 1; i >= 0; i--) {
            int count = 0;
            while (!stack.isEmpty() && stack.peek() < heights[i]) {
                stack.pop();
                count++;
            }
            if (!stack.isEmpty()) count++; // the blocking person (>= heights[i]) is also visible
            answer[i] = count;
            stack.push(heights[i]);
        }
        return answer;
    }
}
```

## Key Takeaways
- The count of *visible* people equals the number popped (strictly shorter, seen over) plus possibly one more for the taller-or-equal blocker that stops the line of sight — don't forget that final `+1`.
- Distinct heights guarantee no ambiguity about ties, simplifying the `<` comparison.
- This is structurally the "next greater element" pattern, but the answer needed is the *count of elements popped* rather than the identity of the next greater element itself.
- Related: Next Greater Element I/II, Daily Temperatures (same right-to-left/left-to-right monotonic stack skeleton, different payload tracked).
