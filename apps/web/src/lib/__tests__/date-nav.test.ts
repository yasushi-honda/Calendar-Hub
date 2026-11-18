import { describe, it, expect } from 'vitest';
import { getAdjacentDate, isTypingTarget, reconcileSelectedDate } from '../date-nav';

const dates = ['2026-11-19', '2026-11-20', '2026-11-21'];

describe('getAdjacentDate', () => {
  it('should return the next date when moving right', () => {
    expect(getAdjacentDate(dates, '2026-11-19', 'next')).toBe('2026-11-20');
  });

  it('should return the previous date when moving left', () => {
    expect(getAdjacentDate(dates, '2026-11-21', 'prev')).toBe('2026-11-20');
  });

  it('should return null at the last date when moving right', () => {
    expect(getAdjacentDate(dates, '2026-11-21', 'next')).toBeNull();
  });

  it('should return null at the first date when moving left', () => {
    expect(getAdjacentDate(dates, '2026-11-19', 'prev')).toBeNull();
  });

  it('should select the first date when nothing is selected and moving right', () => {
    expect(getAdjacentDate(dates, null, 'next')).toBe('2026-11-19');
  });

  it('should select the last date when nothing is selected and moving left', () => {
    expect(getAdjacentDate(dates, null, 'prev')).toBe('2026-11-21');
  });

  it('should treat an unknown selected date like nothing selected', () => {
    expect(getAdjacentDate(dates, '2099-01-01', 'next')).toBe('2026-11-19');
  });

  it('should return null for an empty list', () => {
    expect(getAdjacentDate([], null, 'next')).toBeNull();
    expect(getAdjacentDate([], '2026-11-19', 'prev')).toBeNull();
  });

  it('should return null for a single date at both edges', () => {
    expect(getAdjacentDate(['2026-11-19'], '2026-11-19', 'next')).toBeNull();
    expect(getAdjacentDate(['2026-11-19'], '2026-11-19', 'prev')).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('should be true for input, textarea, select and contenteditable', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('should be false for buttons, body and null', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('reconcileSelectedDate', () => {
  it('should keep the selected date when it is still available', () => {
    expect(reconcileSelectedDate(dates, '2026-11-20')).toBe('2026-11-20');
  });

  it('should fall back to the first date when the selected date disappeared', () => {
    expect(reconcileSelectedDate(['2026-11-20', '2026-11-21'], '2026-11-19')).toBe('2026-11-20');
  });

  it('should select the first date when nothing is selected', () => {
    expect(reconcileSelectedDate(dates, null)).toBe('2026-11-19');
  });

  it('should return null when no dates are available', () => {
    expect(reconcileSelectedDate([], '2026-11-19')).toBeNull();
    expect(reconcileSelectedDate([], null)).toBeNull();
  });
});
