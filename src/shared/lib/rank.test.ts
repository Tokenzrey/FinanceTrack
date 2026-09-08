import { describe, it, expect } from 'vitest';
import {
  RANK_GAP,
  rankBetween,
  needsRebalance,
  rebalancedRanks,
} from './rank';

describe('rank', () => {
  describe('rankBetween', () => {
    it('returns midpoint when both bounds are non-null', () => {
      expect(rankBetween(10, 20)).toBe(15);
    });

    it('returns after - RANK_GAP when before is null', () => {
      expect(rankBetween(null, 500)).toBe(500 - RANK_GAP);
    });

    it('returns before + RANK_GAP when after is null', () => {
      expect(rankBetween(500, null)).toBe(500 + RANK_GAP);
    });

    it('returns RANK_GAP when both are null', () => {
      expect(rankBetween(null, null)).toBe(RANK_GAP);
    });
  });

  describe('needsRebalance', () => {
    it('returns false for empty array', () => {
      expect(needsRebalance([])).toBe(false);
    });

    it('returns false for single-element array', () => {
      expect(needsRebalance([1000])).toBe(false);
    });

    it('returns false when all adjacent pairs have gap >= RANK_MIN_GAP', () => {
      expect(needsRebalance([1000, 2000, 3000])).toBe(false);
    });

    it('returns true when any adjacent pair has gap < RANK_MIN_GAP', () => {
      expect(needsRebalance([1000, 1000.00005, 2000])).toBe(true);
    });

    it('eventually returns true after repeated insertions at same spot', () => {
      const ranks: number[] = [0, RANK_GAP];

      // Repeatedly insert between the last two elements
      for (let i = 0; i < 60; i++) {
        const lastIdx = ranks.length - 1;
        const newRank = rankBetween(ranks[lastIdx - 1], ranks[lastIdx]);
        ranks.push(newRank);
        ranks.sort((a, b) => a - b);
      }

      // Eventually gaps shrink below RANK_MIN_GAP
      expect(needsRebalance(ranks)).toBe(true);
    });
  });

  describe('rebalancedRanks', () => {
    it('returns empty array for count <= 0', () => {
      expect(rebalancedRanks(0)).toEqual([]);
      expect(rebalancedRanks(-5)).toEqual([]);
    });

    it('returns strictly increasing sequence of multiples of RANK_GAP', () => {
      const result = rebalancedRanks(4);
      expect(result).toEqual([1000, 2000, 3000, 4000]);
    });

    it('generates correct sequence for count=1', () => {
      expect(rebalancedRanks(1)).toEqual([RANK_GAP]);
    });

    it('generates n elements for count=n, all strictly increasing', () => {
      const n = 10;
      const result = rebalancedRanks(n);

      expect(result).toHaveLength(n);
      for (let i = 0; i < n - 1; i++) {
        expect(result[i + 1]).toBeGreaterThan(result[i]);
      }
    });
  });
});
