// Fractional ranking: insert cards between neighbours by averaging ranks.
// Prevents O(n) column rewrites on every drag by storing order as a decimal,
// inserting between neighbours at midpoint, and rebalancing only when gaps shrink.

export const RANK_GAP = 1000;
export const RANK_MIN_GAP = 0.0001;

/**
 * Compute the rank to assign a card inserted between two neighbors.
 * - Both bounds non-null: return midpoint
 * - Before null, after non-null: insert at top (after - RANK_GAP)
 * - Before non-null, after null: insert at bottom (before + RANK_GAP)
 * - Both null: empty column (RANK_GAP)
 */
export function rankBetween(
  before: number | null,
  after: number | null
): number {
  if (before !== null && after !== null) {
    return (before + after) / 2;
  }
  if (before === null && after !== null) {
    return after - RANK_GAP;
  }
  if (before !== null && after === null) {
    return before + RANK_GAP;
  }
  return RANK_GAP;
}

/**
 * Check if a sorted array of ranks needs rebalancing.
 * Returns true if any adjacent pair differs by less than RANK_MIN_GAP.
 * Empty arrays and single elements never need rebalancing.
 */
export function needsRebalance(sortedRanks: number[]): boolean {
  if (sortedRanks.length <= 1) {
    return false;
  }

  for (let i = 0; i < sortedRanks.length - 1; i++) {
    const gap = sortedRanks[i + 1] - sortedRanks[i];
    if (gap < RANK_MIN_GAP) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a fresh rebalanced rank sequence: [RANK_GAP, 2*RANK_GAP, ..., count*RANK_GAP].
 * Returns empty array if count <= 0.
 */
export function rebalancedRanks(count: number): number[] {
  if (count <= 0) {
    return [];
  }

  const result: number[] = [];
  for (let i = 1; i <= count; i++) {
    result.push(i * RANK_GAP);
  }
  return result;
}
