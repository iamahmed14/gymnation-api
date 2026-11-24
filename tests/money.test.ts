import { roundHalfUp, vatOf } from '../src/utils/money';

describe('roundHalfUp', () => {
  it('rounds an exact half up', () => {
    expect(roundHalfUp(5, 2)).toBe(3); // 2.5
    expect(roundHalfUp(1, 2)).toBe(1); // 0.5
  });

  it('rounds below a half down and above a half up', () => {
    expect(roundHalfUp(328900, 30)).toBe(10963); // 10963.33
    expect(roundHalfUp(329000, 30)).toBe(10967); // 10966.67
  });
});

describe('vatOf', () => {
  it('rounds an exact half of a minor unit up', () => {
    expect(vatOf(10, 5)).toBe(1); // 0.5
    expect(vatOf(30, 15)).toBe(5); // 4.5
  });

  it('matches the worked examples', () => {
    expect(vatOf(10963, 15)).toBe(1644); // 1644.45
    expect(vatOf(21948, 5)).toBe(1097); // 1097.4
  });
});
