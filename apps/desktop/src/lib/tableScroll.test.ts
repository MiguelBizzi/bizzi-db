import { describe, expect, test } from 'bun:test';
import { clampedScrollAfterWheel } from './tableScroll';

describe('table scrollport', () => {
  test('clips overscroll instead of rubber-banding', async () => {
    const css = await Bun.file(new URL('../index.css', import.meta.url)).text();
    expect(css).toMatch(/html[\s\S]*overscroll-behavior:\s*none/);
    expect(css).toContain('.table-scroll-port');
    expect(css).toMatch(
      /\.table-scroll-port\s*\{[^}]*overscroll-behavior:\s*none/
    );
  });

  test('table views use the non-bouncing scrollport', async () => {
    const grid = await Bun.file(
      new URL('../components/TableView/TableDataGrid.tsx', import.meta.url)
    ).text();
    const results = await Bun.file(
      new URL('../components/SqlEditor/QueryResultsView.tsx', import.meta.url)
    ).text();
    expect(grid).toContain('table-scroll-port');
    expect(results).toContain('table-scroll-port');
  });
});

describe('clampedScrollAfterWheel', () => {
  const box = {
    scrollLeft: 40,
    scrollTop: 80,
    scrollWidth: 400,
    scrollHeight: 800,
    clientWidth: 200,
    clientHeight: 200,
  };

  test('allows scrolling inside the box', () => {
    expect(clampedScrollAfterWheel(box, 10, 20)).toEqual({
      left: 50,
      top: 100,
      overshoot: false,
    });
  });

  test('clamps vertical overscroll at both ends', () => {
    expect(clampedScrollAfterWheel({ ...box, scrollTop: 0 }, 0, -30)).toEqual({
      left: 40,
      top: 0,
      overshoot: true,
    });
    expect(clampedScrollAfterWheel({ ...box, scrollTop: 600 }, 0, 40)).toEqual({
      left: 40,
      top: 600,
      overshoot: true,
    });
  });

  test('clamps horizontal overscroll at both ends', () => {
    expect(clampedScrollAfterWheel({ ...box, scrollLeft: 0 }, -20, 0)).toEqual({
      left: 0,
      top: 80,
      overshoot: true,
    });
    expect(clampedScrollAfterWheel({ ...box, scrollLeft: 200 }, 20, 0)).toEqual({
      left: 200,
      top: 80,
      overshoot: true,
    });
  });

  test('clamps a diagonal gesture that would leave the box', () => {
    expect(
      clampedScrollAfterWheel({ ...box, scrollLeft: 0, scrollTop: 0 }, -12, -18)
    ).toEqual({
      left: 0,
      top: 0,
      overshoot: true,
    });
  });
});
