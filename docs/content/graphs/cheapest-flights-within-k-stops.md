# Cheapest Flights Within K Stops

**Difficulty:** Hard · **Pattern:** Bounded-hop shortest path (Bellman-Ford / DP over stops) · [LeetCode](https://leetcode.com/problems/cheapest-flights-within-k-stops/)

## Problem
Given `n` cities, flights `[from, to, price]`, and a start `src` and destination `dst`, find the cheapest price from `src` to `dst` using at most `k` stops (i.e., at most `k+1` edges). Return `-1` if impossible.

## Examples
**Example 1**
```
Input:  n = 4, flights = [[0,1,100],[1,2,100],[2,0,100],[1,3,600],[2,3,200]], src = 0, dst = 3, k = 1
Output: 700
Explanation: 0 -> 1 -> 3 costs 100 + 600 = 700 using 1 stop. 0 -> 1 -> 2 -> 3 is cheaper (300) but uses 2 stops > k.
```

## Constraints
- `1 <= n <= 100`
- `0 <= flights.length <= (n * (n - 1) / 2)`
- `0 <= src, dst, k < n`, `src != dst`
- `1 <= price <= 10^4`

## Approach 1 — Bellman-Ford limited to k+1 relaxations
**Idea.** A plain Dijkstra can't respect a hop limit directly because "cheapest" and "fewest edges" trade off. Instead relax all edges exactly `k+1` times (Bellman-Ford truncated), using a snapshot of the previous round's distances each time so we don't chain multiple hops within one round.
**Complexity.** Time O(k · E), Space O(n).
```java
class Solution {
    public int findCheapestPrice(int n, int[][] flights, int src, int dst, int k) {
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[src] = 0;

        for (int round = 0; round <= k; round++) {
            int[] next = dist.clone();
            for (int[] f : flights) {
                int u = f[0], v = f[1], w = f[2];
                if (dist[u] != Integer.MAX_VALUE && dist[u] + w < next[v]) {
                    next[v] = dist[u] + w;
                }
            }
            dist = next;
        }
        return dist[dst] == Integer.MAX_VALUE ? -1 : dist[dst];
    }
}
```

## Approach 2 — BFS/Dijkstra variant with (node, stops) state (optimal for sparse k)
**Idea.** Track the best cost to reach each `(city, stopsUsed)` state, exploring with a priority queue ordered by cost. Because the state also carries how many stops have been used, we can prune states that already exceed both the cost and the stop budget of a previously seen state, avoiding wasted relaxations that plain Dijkstra would otherwise miss.
**Complexity.** Time O(E · k log(E · k)) worst case, Space O(n · k).
```java
class Solution {
    public int findCheapestPrice(int n, int[][] flights, int src, int dst, int k) {
        Map<Integer, List<int[]>> graph = new HashMap<>();
        for (int[] f : flights) {
            graph.computeIfAbsent(f[0], x -> new ArrayList<>()).add(new int[]{f[1], f[2]});
        }

        // state: {cost, node, stopsUsed}
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        pq.offer(new int[]{0, src, 0});
        int[] bestStops = new int[n];
        Arrays.fill(bestStops, Integer.MAX_VALUE);

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int cost = cur[0], node = cur[1], stops = cur[2];
            if (node == dst) return cost;
            if (stops > k || stops >= bestStops[node]) continue;
            bestStops[node] = stops;

            for (int[] edge : graph.getOrDefault(node, Collections.emptyList())) {
                pq.offer(new int[]{cost + edge[1], edge[0], stops + 1});
            }
        }
        return -1;
    }
}
```

## Key Takeaways
- A hop-limited shortest path is not solvable by plain Dijkstra since it optimizes cost only — you must fold "stops used" into the state or the relaxation round count.
- Truncated Bellman-Ford (exactly k+1 rounds, using a snapshot per round) is the simplest correct approach and easy to prove.
- The (node, stopsUsed) priority-queue variant generalizes to other "shortest path with a budget" problems (fuel, time windows, etc.).
