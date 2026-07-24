# Count Primes

**Difficulty:** Medium · **Pattern:** Sieve of Eratosthenes · [LeetCode](https://leetcode.com/problems/count-primes/)

## Problem
Given an integer `n`, return the number of prime numbers that are strictly less than `n`.

## Examples
**Example 1**
```
Input:  n = 10
Output: 4
Explanation: The primes less than 10 are 2, 3, 5, 7.
```

**Example 2**
```
Input:  n = 0
Output: 0
```

**Example 3**
```
Input:  n = 1
Output: 0
```

## Constraints
- `0 <= n <= 5 * 10^6`

## Approach 1 — Trial division per number
**Idea.** For each candidate `k` from 2 to `n-1`, test primality by trial dividing up to `sqrt(k)`. Correct but too slow at the upper constraint (`5 * 10^6`), since it re-does work for every number independently instead of sharing composite information.
**Complexity.** Time O(n · sqrt(n)), Space O(1).
```java
class Solution {
    public int countPrimes(int n) {
        int count = 0;
        for (int k = 2; k < n; k++) {
            if (isPrime(k)) count++;
        }
        return count;
    }

    private boolean isPrime(int k) {
        for (int d = 2; (long) d * d <= k; d++) {
            if (k % d == 0) return false;
        }
        return true;
    }
}
```

## Approach 2 — Sieve of Eratosthenes (optimal)
**Idea.** Mark composites by walking multiples of each prime starting at `p*p` (smaller multiples were already struck out by smaller primes). Only iterate the outer loop while `p*p < n`, since any composite `< n` must have a factor `<= sqrt(n)`. Count the unmarked (prime) entries in `[2, n)` at the end.
**Complexity.** Time O(n log log n), Space O(n).
```java
class Solution {
    public int countPrimes(int n) {
        if (n < 3) return 0;

        boolean[] composite = new boolean[n]; // composite[i] == true means i is NOT prime
        int count = 0;

        for (int p = 2; (long) p * p < n; p++) {
            if (!composite[p]) {
                for (int multiple = p * p; multiple < n; multiple += p) {
                    composite[multiple] = true;
                }
            }
        }

        for (int i = 2; i < n; i++) {
            if (!composite[i]) count++;
        }
        return count;
    }
}
```

## Key Takeaways
- The Sieve of Eratosthenes amortizes work across all numbers up to `n` instead of testing each independently, giving near-linear O(n log log n) time.
- Start marking multiples from `p*p`, not `2p` — anything smaller is guaranteed already marked by a smaller prime factor.
- The outer sieve loop only needs to run while `p*p < n`; beyond that, no new composites can be discovered.
