import { describe, it, expect } from 'vitest';
import { formatAmount, initialsOf } from '../format';

describe('formatAmount', () => {
  it.each([
    [0, '0.00'],
    [1, '1.00'],
    [1.5, '1.50'],
    [1234.5, '1,234.50'],
    [1234567.89, '1,234,567.89'],
    [-2500, '-2,500.00'],
    [0.125, '0.13'], // rounds to 2 dp
  ])('formats %p as %p with en-PH grouping and 2 decimals', (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it('always shows exactly two fraction digits', () => {
    expect(formatAmount(5)).toBe('5.00');
    expect(formatAmount(5.1)).toBe('5.10');
    expect(formatAmount(5.129)).toBe('5.13');
  });
});

describe('initialsOf', () => {
  it.each([
    ['Bayanihan Savings Bank Corp.', 'BS'],
    ['Apple', 'A'],
    ['jasper lepardo', 'JL'],
    ['  leading   spaces  here', 'LS'],
    ['', ''],
  ])('derives initials of %p as %p', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  it('takes the first letter or digit of each of the first two words', () => {
    expect(initialsOf('7-Eleven Store')).toBe('7S');
    expect(initialsOf('(Acme) Holdings')).toBe('AH');
  });

  it('uppercases the result', () => {
    expect(initialsOf('acme bravo')).toBe('AB');
  });
});
