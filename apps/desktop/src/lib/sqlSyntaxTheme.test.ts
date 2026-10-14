import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { sqlHighlightStyle } from './sqlSyntaxTheme';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

const TOKENS = [
  'keyword',
  'string',
  'constant',
  'function',
  'type',
  'operator',
  'punctuation',
  'comment',
] as const;

interface Oklch {
  l: number;
  c: number;
  h: number;
}

function themeVars(selector: ':root' | '.dark'): Record<string, Oklch> {
  const pattern = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`);
  const block = css.match(pattern)?.[1] ?? '';
  const vars: Record<string, Oklch> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    vars[m[1]] = { l: Number(m[2]), c: Number(m[3]), h: Number(m[4]) };
  }
  return vars;
}

function luminance({ l, c, h }: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([':root', '.dark'] as const)('SQL syntax palette in %s', (selector) => {
  const vars = themeVars(selector);

  test('defines every token colour', () => {
    for (const token of TOKENS) expect(vars[`syntax-${token}`]).toBeDefined();
  });

  test('is readable against the editor background (WCAG AA)', () => {
    for (const token of TOKENS) {
      const ratio = contrast(vars[`syntax-${token}`], vars.background);
      expect(`${token} ${ratio >= 4.5 ? 'ok' : ratio.toFixed(2)}`).toBe(`${token} ok`);
    }
  });

  test('keeps plain text above the contrast of any syntax colour for identifiers', () => {
    expect(contrast(vars.foreground, vars.background)).toBeGreaterThanOrEqual(7);
  });

  test('never uses purple or violet', () => {
    for (const token of TOKENS) {
      const { c, h } = vars[`syntax-${token}`];
      const purple = c > 0.04 && h >= 285 && h <= 345;
      expect(`${token} ${purple ? 'purple' : 'ok'}`).toBe(`${token} ok`);
    }
  });

  test('keeps the main token families visually distinct', () => {
    const families = ['keyword', 'string', 'constant', 'function', 'type'] as const;
    for (const [i, x] of families.entries()) {
      for (const y of families.slice(i + 1)) {
        const a = vars[`syntax-${x}`].h;
        const b = vars[`syntax-${y}`].h;
        const gap = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
        expect(`${x}/${y} ${gap >= 25 ? 'ok' : gap.toFixed(0)}`).toBe(`${x}/${y} ok`);
      }
    }
  });
});

describe('sqlHighlightStyle', () => {
  test('only references colours that exist in both themes', () => {
    const used = new Set(
      sqlHighlightStyle.specs
        .map((spec) => /var\((--syntax-[\w-]+)\)/.exec(String(spec.color))?.[1])
        .filter((name): name is string => !!name)
    );
    expect(used.size).toBeGreaterThanOrEqual(TOKENS.length);
    for (const selector of [':root', '.dark'] as const) {
      const vars = themeVars(selector);
      for (const name of used) expect(`${name} ${vars[name.slice(2)] ? 'ok' : 'missing'}`).toBe(`${name} ok`);
    }
  });
});
