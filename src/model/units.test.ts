import { formatLength, formatLong, parseLength } from './units';

describe('units', () => {
  it.each([
    ['29.5', 'in', 29.5],
    ['5\' 3.5"', 'in', 63.5],
    ['5ft 3in', 'in', 63],
    ['5\'', 'in', 60],
    ['63in', 'cm', 63],
    ['2.54', 'cm', 1],
    ['254cm', 'in', 100],
    ['1.27m', 'in', 50],
    ['.5', 'in', 0.5],
  ] as const)('parses %s (%s) → %f in', (text, units, expected) => {
    expect(parseLength(text, units)).toBeCloseTo(expected);
  });

  it('rejects garbage', () => {
    expect(parseLength('abc', 'in')).toBeUndefined();
    expect(parseLength('', 'in')).toBeUndefined();
  });

  it('formats', () => {
    expect(formatLength(10, 'in')).toBe('10"');
    expect(formatLength(10, 'cm')).toBe('25.4 cm');
    expect(formatLong(75.5, 'in')).toBe(`6' 3.5"`);
    expect(formatLong(100 / 2.54 * 1.5, 'cm')).toBe('1.5 m');
  });
});
