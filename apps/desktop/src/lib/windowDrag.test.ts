import { describe, expect, test } from 'bun:test';
import capabilities from '../../src-tauri/capabilities/default.json';
import { handleTitlebarMouseDown, shouldStartWindowDrag } from './windowDrag';

type TestNode = {
  tagName: string;
  getAttribute(name: string): string | null;
  parentElement: TestNode | null;
};

function node(
  tag: string,
  attrs: Record<string, string> = {},
  parent: TestNode | null = null
): TestNode {
  return {
    tagName: tag.toUpperCase(),
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    parentElement: parent,
  };
}

describe('shouldStartWindowDrag', () => {
  test('allows dragging from the titlebar and nested non-interactive children', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    const label = node('span', {}, node('div', {}, titlebar));

    expect(shouldStartWindowDrag(titlebar as unknown as EventTarget)).toBe(true);
    expect(shouldStartWindowDrag(label as unknown as EventTarget)).toBe(true);
  });

  test('does not drag when clicking buttons or other controls in the titlebar', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    const button = node('button', { type: 'button' }, titlebar);
    const icon = node('span', {}, button);

    expect(shouldStartWindowDrag(button as unknown as EventTarget)).toBe(false);
    expect(shouldStartWindowDrag(icon as unknown as EventTarget)).toBe(false);
  });

  test('does not drag from a no-drag hover menu in the titlebar', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    const menu = node('div', { 'data-no-drag': '' }, titlebar);
    const label = node('span', {}, menu);

    expect(shouldStartWindowDrag(menu as unknown as EventTarget)).toBe(false);
    expect(shouldStartWindowDrag(label as unknown as EventTarget)).toBe(false);
  });

  test('does not drag outside a drag region', () => {
    expect(shouldStartWindowDrag(node('div') as unknown as EventTarget)).toBe(false);
    expect(shouldStartWindowDrag(null)).toBe(false);
  });
});

describe('handleTitlebarMouseDown', () => {
  test('starts a drag on a nested titlebar click and skips controls', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    const label = node('span', {}, titlebar);
    const button = node('button', {}, node('header', { 'data-tauri-drag-region': '' }));

    let drags = 0;
    const startDrag = () => {
      drags += 1;
    };

    handleTitlebarMouseDown(
      {
        button: 0,
        detail: 1,
        target: label as unknown as EventTarget,
        preventDefault() {},
      },
      startDrag
    );
    expect(drags).toBe(1);

    handleTitlebarMouseDown(
      {
        button: 0,
        detail: 1,
        target: button as unknown as EventTarget,
        preventDefault() {},
      },
      startDrag
    );
    expect(drags).toBe(1);
  });
});

describe('handleTitlebarMouseDown double click', () => {
  const run = (target: TestNode, withToggle: boolean) => {
    const calls = { drag: 0, toggle: 0 };
    handleTitlebarMouseDown(
      { button: 0, detail: 2, target: target as unknown as EventTarget, preventDefault() {} },
      () => {
        calls.drag += 1;
      },
      withToggle
        ? () => {
            calls.toggle += 1;
          }
        : undefined
    );
    return calls;
  };

  test('toggles maximize once from a child of the drag region', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    expect(run(node('span', {}, titlebar), true)).toEqual({ drag: 0, toggle: 1 });
  });

  test('leaves a double click on the drag region itself to Tauri', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    expect(run(titlebar, true)).toEqual({ drag: 0, toggle: 0 });
  });

  test('ignores controls', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    expect(run(node('button', {}, titlebar), true)).toEqual({ drag: 0, toggle: 0 });
  });

  test('does nothing without a toggleMaximize handler', () => {
    const titlebar = node('header', { 'data-tauri-drag-region': '' });
    expect(run(node('span', {}, titlebar), false)).toEqual({ drag: 0, toggle: 0 });
  });
});

describe('window capabilities', () => {
  test('allows startDragging so the overlay titlebar can move the window', () => {
    expect(capabilities.permissions).toContain('core:window:allow-start-dragging');
  });
});

describe('titlebar drag CSS', () => {
  test('opts hover menus out of the native drag region', async () => {
    const css = await Bun.file(new URL('../index.css', import.meta.url)).text();
    expect(css).toContain('[data-no-drag]');
  });
});
