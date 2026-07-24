# Candy

**Difficulty:** Hard · **Pattern:** two-pass greedy (local comparisons enforce global constraint) · [LeetCode](https://leetcode.com/problems/candy/)

## Problem
`n` children stand in a line, each with a rating `ratings[i]`. Every child gets at least one candy, and any child with a higher rating than an immediate neighbor must get more candies than that neighbor. Return the minimum total candies needed.

## Examples
**Example 1**
```
Input:  ratings = [1,0,2]
Output: 5
Explanation: Candies = [2,1,2]. Child 0 (1>0) needs more than child 1; child 2 (2>0) needs more than child 1.
```

**Example 2**
```
Input:  ratings = [1,2,2]
Output: 4
Explanation: Candies = [1,2,1]. Third child equals second, so no extra candy is required (only strict increases matter).
```

## Constraints
- `n == ratings.length`
- `1 <= n <= 2 * 10^4`
- `0 <= ratings[i] <= 2 * 10^4`

## Approach 1 — Two-Pass Greedy (Left-to-Right, Right-to-Left)
**Idea.** The constraint is purely local (compare each child only to its immediate neighbors), but it must hold simultaneously in both directions. Initialize all candies to 1. Left-to-right pass: if `ratings[i] > ratings[i-1]`, set `candies[i] = candies[i-1] + 1` (satisfies the "increasing on the left" requirement). Right-to-left pass: if `ratings[i] > ratings[i+1]`, set `candies[i] = max(candies[i], candies[i+1] + 1)` (satisfies the "increasing on the right" requirement without undoing the left pass's guarantee, thanks to the `max`). Each pass greedily assigns the minimum increment needed to satisfy one direction; taking the max of both passes is the exchange argument — any smaller value would violate one of the two constraints, and any larger value would waste candy.
**Complexity.** Time O(n), Space O(n).
```java
class Solution {
    public int candy(int[] ratings) {
        int n = ratings.length;
        int[] candies = new int[n];
        Arrays.fill(candies, 1);

        for (int i = 1; i < n; i++) {
            if (ratings[i] > ratings[i - 1]) {
                candies[i] = candies[i - 1] + 1;
            }
        }
        for (int i = n - 2; i >= 0; i--) {
            if (ratings[i] > ratings[i + 1]) {
                candies[i] = Math.max(candies[i], candies[i + 1] + 1);
            }
        }

        int total = 0;
        for (int c : candies) total += c;
        return total;
    }
}
```

## Approach 2 — Constant-Space Slope Counting (Peak/Valley Walk)
**Idea.** Walk the array once, tracking the length of the current ascending run (`up`), the current descending run (`down`), and the last peak height. On a strict increase, extend `up` and add `up + 1` candies. On a strict decrease, extend `down`, add `down + 1` candies, and if the descending run has grown at least as long as the last peak, add one extra candy to keep the peak strictly greater than the valley it must dominate on both sides. On a tie, reset both runs to 1 and give exactly 1 candy. This compresses the two-pass idea into O(1) space by reasoning about run lengths instead of storing per-child arrays.
**Complexity.** Time O(n), Space O(1).
```java
class Solution {
    public int candy(int[] ratings) {
        int n = ratings.length;
        if (n <= 1) return n;

        int total = 1, up = 0, down = 0, peak = 0;
        for (int i = 1; i < n; i++) {
            if (ratings[i] > ratings[i - 1]) {
                up++; down = 0; peak = up;
                total += 1 + up;
            } else if (ratings[i] < ratings[i - 1]) {
                up = 0; down++;
                total += 1 + down;
                if (down == peak) total++; // valley run caught up to the peak height, bump the peak
            } else {
                up = 0; down = 0; peak = 0;
                total += 1;
            }
        }
        return total;
    }
}
```

## Key Takeaways
- Local constraints (compare only to immediate neighbors) still require a global pass in both directions, since one direction's fix can be overridden by the other.
- Greedy correctness: always assign the minimum candy increment (`neighbor + 1`) that satisfies the currently-checked direction, then reconcile with `max` so neither direction's requirement is violated.
- The O(1)-space slope-walk version is an optimization of the same greedy idea — it avoids materializing the candies array by tracking run lengths and the peak explicitly.
