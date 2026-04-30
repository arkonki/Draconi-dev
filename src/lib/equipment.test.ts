import { applyMoneyDelta, normalizeCurrency, subtractCost } from './equipment';

describe('equipment money helpers', () => {
  it('normalizes upward currency overflow', () => {
    expect(normalizeCurrency({ gold: 0, silver: 14, copper: 23 })).toEqual({
      gold: 1,
      silver: 6,
      copper: 3,
    });
  });

  it('breaks larger coins when spending smaller amounts', () => {
    const result = applyMoneyDelta(
      { gold: 0, silver: 1, copper: 0 },
      { gold: 0, silver: 0, copper: -3 },
    );

    expect(result).toEqual({
      success: true,
      newMoney: { gold: 0, silver: 0, copper: 7 },
    });
  });

  it('rejects spending more than the available total value', () => {
    const result = applyMoneyDelta(
      { gold: 0, silver: 1, copper: 0 },
      { gold: 0, silver: -2, copper: 0 },
    );

    expect(result.success).toBe(false);
    expect(result.newMoney).toEqual({ gold: 0, silver: 1, copper: 0 });
  });

  it('keeps shop purchases on the same conversion rules', () => {
    const result = subtractCost(
      { gold: 0, silver: 1, copper: 0 },
      { gold: 0, silver: 0, copper: 3 },
    );

    expect(result).toEqual({
      success: true,
      newMoney: { gold: 0, silver: 0, copper: 7 },
    });
  });
});
