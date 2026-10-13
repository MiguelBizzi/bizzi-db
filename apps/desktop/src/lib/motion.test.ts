import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  DURATION,
  EASE_IN,
  EASE_OUT,
  EXIT_RATIO,
  collapse,
  enterTransition,
  exitTransition,
  fade,
  popIn,
  scaleIn,
  slideInRight,
  slideUp,
  viewEnter,
} from './motion';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const token = (name: string) =>
  css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

describe('motion constants', () => {
  test('durations match the spec', () => {
    expect(DURATION).toEqual({ fast: 0.12, base: 0.18, slow: 0.24 });
    expect(EXIT_RATIO).toBe(0.75);
  });

  test('CSS tokens hold the same values', () => {
    expect(token('--motion-fast')).toBe('120ms');
    expect(token('--motion-base')).toBe('180ms');
    expect(token('--motion-slow')).toBe('240ms');
    expect(token('--ease-out')).toBe(`cubic-bezier(${EASE_OUT.join(', ')})`);
    expect(token('--ease-in')).toBe(`cubic-bezier(${EASE_IN.join(', ')})`);
  });

  test('exit runs at 75% of enter with the exit easing', () => {
    expect(enterTransition(0.18)).toEqual({ duration: 0.18, ease: EASE_OUT });
    expect(exitTransition(0.24)).toEqual({ duration: 0.18, ease: EASE_IN });
  });
});

describe('motion variants', () => {
  const withExit = { fade, scaleIn, slideInRight, slideUp, collapse, popInTop: popIn('top') };

  test.each(Object.entries(withExit))('%s defines initial, animate and exit', (_, v) => {
    expect(Object.keys(v).sort()).toEqual(['animate', 'exit', 'initial']);
  });

  test('viewEnter has no exit', () => {
    expect(Object.keys(viewEnter).sort()).toEqual(['animate', 'initial']);
  });

  test('nothing is longer than 240ms', () => {
    for (const v of [...Object.values(withExit), viewEnter]) {
      const d = (v.animate as { transition: { duration: number } }).transition.duration;
      expect(d).toBeLessThanOrEqual(0.24);
    }
  });

  test('popIn offsets away from the trigger side', () => {
    expect(popIn('top').initial).toMatchObject({ y: -4, scale: 0.96, opacity: 0 });
    expect(popIn('bottom').initial).toMatchObject({ y: 4 });
    expect(popIn('left').initial).toMatchObject({ x: -4 });
    expect(popIn('right').initial).toMatchObject({ x: 4 });
  });
});
