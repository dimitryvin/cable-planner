import { retailLength } from './retail';

describe('retailLength', () => {
  it.each([
    [5, '1 ft', 12],
    [12, '1 ft', 12],
    [12.01, '3 ft', 36],
    [40, '6 ft', 72],
    [72, '6 ft', 72],
    [100, '10 ft', 120],
    [150, '15 ft', 180],
  ])('imperial: %f in → %s', (needed, label, length) => {
    expect(retailLength(needed, 'imperial')).toEqual({ label, length, overflow: false });
  });

  it.each([
    [10, '0.5 m'],
    [19.6, '0.5 m'], [19.7, '1 m'],
    [20, '1 m'],
    [60, '2 m'],
    [100, '3 m'],
    [150, '5 m'],
  ])('metric: %f in → %s', (needed, label) => {
    expect(retailLength(needed, 'metric').label).toBe(label);
  });

  it('flags lengths beyond the longest retail size', () => {
    expect(retailLength(200, 'imperial')).toEqual({ label: '> 15 ft', length: 180, overflow: true });
    expect(retailLength(200, 'metric').overflow).toBe(true);
  });
});
