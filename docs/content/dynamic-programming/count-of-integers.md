# Count of Integers

**Difficulty:** Very Hard · **Pattern:** Digit DP `dp(pos, tight, digitSum)` + range subtraction via big-number decrement · [LeetCode](https://leetcode.com/problems/count-of-integers/)

## Problem
Given two numeric strings `num1` and `num2` representing the inclusive range `[num1, num2]`, and integers `min_sum`, `max_sum`, return how many integers in that range have a digit sum between `min_sum` and `max_sum` (inclusive). Return the answer modulo `1e9 + 7`.

## Examples
**Example 1**
```
Input:  num1 = "1", num2 = "12", min_sum = 1, max_sum = 8
Output: 11
Explanation: 1..12 has digit sums 1,2,3,4,5,6,7,8,9,1,2,3; only 9 (sum 9) is excluded, giving 11 valid numbers.
```

**Example 2**
```
Input:  num1 = "1", num2 = "5", min_sum = 1, max_sum = 5
Output: 5
Explanation: Every number 1..5 has digit sum equal to itself, all within [1,5].
```

## Constraints
- 1 <= num1 <= num2 <= 10^22
- 1 <= min_sum <= max_sum <= 400

## Approach 1 — Brute force digit sum scan
**Idea.** Walk every integer from `num1` to `num2` (as `BigInteger`, since values can exceed `long`), compute its digit sum by summing the characters of its decimal form, and count it if the sum falls in `[min_sum, max_sum]`. This is a direct simulation with no DP state — correct, but only tractable when `num2 - num1` is small. With `num2` up to `10^22`, this is astronomically slower than the real constraints allow.
**Complexity.** Time O((num2 - num1) · digits), Space O(1).
```java
class Solution {
    private static final int MOD = 1_000_000_007;

    public int count(String num1, String num2, int minSum, int maxSum) {
        java.math.BigInteger lo = new java.math.BigInteger(num1);
        java.math.BigInteger hi = new java.math.BigInteger(num2);
        java.math.BigInteger one = java.math.BigInteger.ONE;

        long count = 0;
        for (java.math.BigInteger x = lo; x.compareTo(hi) <= 0; x = x.add(one)) {
            int sum = digitSum(x.toString());
            if (sum >= minSum && sum <= maxSum) count++;
        }
        return (int) (count % MOD);
    }

    private int digitSum(String s) {
        int sum = 0;
        for (char c : s.toCharArray()) sum += c - '0';
        return sum;
    }
}
```

## Approach 2 — Digit DP with prefix-sum decomposition (optimal)
**Idea.** Define `countUpTo(N)` = number of integers in `[0, N]` with digit sum in `[minSum, maxSum]`, computed with the standard digit-DP state `dp(pos, sum, tight)`:
- `pos` — the current index into `N`'s decimal string.
- `sum` — the digit sum accumulated so far (pruned the moment it exceeds `maxSum`).
- `tight` — whether the prefix built so far equals `N`'s prefix exactly (if not tight, all digits 0–9 are free at this and every later position).

The recurrence tries every digit `d` from 0 up to the position's limit (`N`'s digit if `tight`, else 9), recursing with `tight' = tight && d == limit`. At `pos == length`, the branch counts as 1 iff `sum >= minSum` (it's already `<= maxSum` by the pruning check).

Since the answer is over the range `[num1, num2]`, compute it as `countUpTo(num2) - countUpTo(num1 - 1)`. Subtracting 1 from a numeric string requires a manual decrement helper (a plain `int`/`long` cannot hold up to 22 digits).
**Complexity.** Time O(len · maxSum) for each `countUpTo` call (memoized over non-tight states), Space O(len · maxSum).
```java
class Solution {
    private static final int MOD = 1_000_000_007;
    private int minSum, maxSum;

    public int count(String num1, String num2, int minSum, int maxSum) {
        this.minSum = minSum;
        this.maxSum = maxSum;
        int upper = countUpTo(num2);
        int lower = countUpTo(decrement(num1));
        int ans = upper - lower;
        return ((ans % MOD) + MOD) % MOD;
    }

    // Count integers in [0, N] (N given as a numeric string) with digit sum in [minSum, maxSum]
    private int countUpTo(String n) {
        if (n.equals("-1")) return 0; // num1 was "0" -> nothing below it
        int len = n.length();
        Integer[][] memo = new Integer[len][maxSum + 1];
        return dp(0, 0, true, n, memo);
    }

    private int dp(int pos, int sum, boolean tight, String n, Integer[][] memo) {
        if (sum > maxSum) return 0;
        if (pos == n.length()) {
            return sum >= minSum ? 1 : 0;
        }
        if (!tight && memo[pos][sum] != null) return memo[pos][sum];

        int limit = tight ? n.charAt(pos) - '0' : 9;
        long total = 0;
        for (int d = 0; d <= limit; d++) {
            total += dp(pos + 1, sum + d, tight && d == limit, n, memo);
        }
        total %= MOD;
        if (!tight) memo[pos][sum] = (int) total;
        return (int) total;
    }

    // Decrement a non-negative numeric string by 1; returns "-1" sentinel if input is "0"
    private String decrement(String num) {
        char[] arr = num.toCharArray();
        int i = arr.length - 1;
        while (i >= 0 && arr[i] == '0') {
            arr[i] = '9';
            i--;
        }
        if (i < 0) return "-1";
        arr[i]--;

        String result = new String(arr);
        int start = 0;
        while (start < result.length() - 1 && result.charAt(start) == '0') start++;
        return result.substring(start);
    }
}
```

## Key Takeaways
- "Count in `[A, B]`" almost always decomposes into `countUpTo(B) - countUpTo(A - 1)` — the hard part is implementing `A - 1` correctly when `A` is a string that can be all zeros.
- Memoization is only valid on `!tight` states, because `tight` states depend on the specific bound string `n`, not just `(pos, sum)`.
- Pruning `sum > maxSum` early keeps the DP table small (`maxSum <= 400`) even though the numbers themselves have up to 22 digits.
