import { describe, expect, test } from "bun:test";
import { clampedScrollAfterWheel } from "./tableScroll";

describe("table scrollport", () => {
  test("does not trap wheel events (that kills macOS momentum scrolling)", async () => {
    const src = await Bun.file(new URL("./tableScroll.ts", import.meta.url)).text();
    expect(src).not.toContain("passive: false");
    expect(src).not.toContain("preventDefault");
  });

  test("does not force always-visible thin bars in components", async () => {
    const hits: string[] = [];
    for await (const file of new Bun.Glob("**/*.{tsx,css}").scan({
      cwd: new URL("..", import.meta.url).pathname,
    })) {
      if (file.endsWith(".css") || file.includes("tableScroll.test")) continue;
      const text = await Bun.file(new URL(`../${file}`, import.meta.url)).text();
      if (
        text.includes("scrollbar-thin") ||
        text.includes("scrollbar-thumb") ||
        text.includes("scrollbar-track")
      ) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  test("clips overscroll instead of rubber-banding", async () => {
    const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
    expect(css).toMatch(/html[\s\S]*overscroll-behavior:\s*none/);
    expect(css).toContain(".table-scroll-port");
    expect(css).toMatch(
      /\.table-scroll-port\s*\{[^}]*overscroll-behavior:\s*none/,
    );
  });

  test("table views use the non-bouncing scrollport", async () => {
    const grid = await Bun.file(
      new URL("../components/TableView/TableDataGrid.tsx", import.meta.url),
    ).text();
    const results = await Bun.file(
      new URL("../components/SqlEditor/QueryResultsView.tsx", import.meta.url),
    ).text();
    expect(grid).toContain("table-scroll-port");
    expect(results).toContain("table-scroll-port");
  });

  test("wide grids keep sticky headers on the same column track as cells", async () => {
    const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
    expect(css).toMatch(
      /\.table-scroll-port\s+table\s*\{[^}]*border-collapse:\s*separate/,
    );
    expect(css).toMatch(
      /\.table-scroll-port\s+table\s*\{[^}]*border-spacing:\s*0/,
    );
    expect(css).toMatch(
      /\.table-scroll-port\s+table\s*\{[^}]*width:\s*max-content/,
    );
    expect(css).toMatch(
      /\.table-scroll-port\s+table\s*\{[^}]*min-width:\s*100%/,
    );
    expect(css).toMatch(
      /\.table-scroll-port\s+thead\s+th\s*\{[^}]*position:\s*sticky/,
    );

    const grid = await Bun.file(
      new URL("../components/TableView/TableDataGrid.tsx", import.meta.url),
    ).text();
    const results = await Bun.file(
      new URL("../components/SqlEditor/QueryResultsView.tsx", import.meta.url),
    ).text();
    for (const source of [grid, results]) {
      const snippet = source.slice(
        source.indexOf("table-scroll-port"),
        source.indexOf("table-scroll-port") + 900,
      );
      expect(snippet).not.toMatch(/border-collapse/);
      expect(snippet).not.toMatch(/<thead[^>]*sticky/);
    }
  });
});

describe("clampedScrollAfterWheel", () => {
  const box = {
    scrollLeft: 40,
    scrollTop: 80,
    scrollWidth: 400,
    scrollHeight: 800,
    clientWidth: 200,
    clientHeight: 200,
  };

  test("allows scrolling inside the box", () => {
    expect(clampedScrollAfterWheel(box, 10, 20)).toEqual({
      left: 50,
      top: 100,
      overshoot: false,
    });
  });

  test("clamps vertical overscroll at both ends", () => {
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

  test("clamps horizontal overscroll at both ends", () => {
    expect(clampedScrollAfterWheel({ ...box, scrollLeft: 0 }, -20, 0)).toEqual({
      left: 0,
      top: 80,
      overshoot: true,
    });
    expect(clampedScrollAfterWheel({ ...box, scrollLeft: 200 }, 20, 0)).toEqual(
      {
        left: 200,
        top: 80,
        overshoot: true,
      },
    );
  });

  test("clamps a diagonal gesture that would leave the box", () => {
    expect(
      clampedScrollAfterWheel(
        { ...box, scrollLeft: 0, scrollTop: 0 },
        -12,
        -18,
      ),
    ).toEqual({
      left: 0,
      top: 0,
      overshoot: true,
    });
  });
});
