export type Matrix = number[][];

export function nearestNeighborOrder(matrix: Matrix, startIdx = 0) {
  const n = matrix.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];

  let cur = startIdx;
  visited[cur] = true;
  order.push(cur);

  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const c = matrix[cur][j];
      if (Number.isFinite(c) && c < bestCost) {
        best = j;
        bestCost = c;
      }
    }
    if (best === -1) break;
    visited[best] = true;
    order.push(best);
    cur = best;
  }

  // If any remain (incomplete matrix), append them.
  for (let j = 0; j < n; j++) if (!visited[j]) order.push(j);
  return order;
}

export function pathCost(matrix: Matrix, order: number[]) {
  let cost = 0;
  for (let i = 0; i < order.length - 1; i++) {
    cost += matrix[order[i]][order[i + 1]] ?? 0;
  }
  return cost;
}

export function twoOptImprove(matrix: Matrix, order: number[], maxIters = 2000) {
  const n = order.length;
  if (n < 4) return order;

  let best = order.slice();
  let bestCost = pathCost(matrix, best);
  let iters = 0;

  for (let improved = true; improved && iters < maxIters; ) {
    improved = false;
    iters++;
    for (let i = 1; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        const candidate = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse())
          .concat(best.slice(k + 1));

        const c = pathCost(matrix, candidate);
        if (c + 1e-6 < bestCost) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }

  return best;
}

// Held-Karp (path, not cycle): minimize start -> ... -> end (end is free).
// For the MVP we keep startIdx fixed and leave end free (chosen as the last node).
export function heldKarpPath(matrix: Matrix, startIdx = 0) {
  const n = matrix.length;
  if (n <= 1) return [startIdx];
  if (n > 12) return null; // practical limit

  // DP[mask][j] = min cost to go from start to j visiting mask (includes j)
  const size = 1 << n;
  const DP = Array.from({ length: size }, () => new Array<number>(n).fill(Infinity));
  const parent = Array.from({ length: size }, () => new Array<number>(n).fill(-1));

  const startMask = 1 << startIdx;
  DP[startMask][startIdx] = 0;

  for (let mask = 0; mask < size; mask++) {
    if ((mask & startMask) === 0) continue;
    for (let j = 0; j < n; j++) {
      if ((mask & (1 << j)) === 0) continue;
      const curCost = DP[mask][j];
      if (!Number.isFinite(curCost)) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const nextMask = mask | (1 << k);
        const c = matrix[j][k];
        const nextCost = curCost + (Number.isFinite(c) ? c : 1e9);
        if (nextCost < DP[nextMask][k]) {
          DP[nextMask][k] = nextCost;
          parent[nextMask][k] = j;
        }
      }
    }
  }

  const full = (1 << n) - 1;
  // End is free: pick j with the lowest DP[full][j]
  let end = -1;
  let bestCost = Infinity;
  for (let j = 0; j < n; j++) {
    const c = DP[full][j];
    if (c < bestCost) {
      bestCost = c;
      end = j;
    }
  }
  if (end === -1) return null;

  // Reconstruct path
  const order: number[] = [];
  let mask = full;
  let cur = end;
  while (cur !== -1) {
    order.push(cur);
    const prev = parent[mask][cur];
    mask = mask & ~(1 << cur);
    cur = prev;
  }
  order.reverse();
  return order;
}



