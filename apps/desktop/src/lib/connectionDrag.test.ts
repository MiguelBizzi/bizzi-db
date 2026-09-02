import { describe, expect, test } from 'bun:test';
import {
  CONNECTION_DRAG_THRESHOLD_PX,
  connectionPointerUpKind,
  shouldActivateConnectionDrag,
} from './connectionDrag';

describe('shouldActivateConnectionDrag', () => {
  test('ignores movement under the threshold so a click is not a drag', () => {
    expect(shouldActivateConnectionDrag(10, 10, 10, 10)).toBe(false);
    expect(shouldActivateConnectionDrag(10, 10, 14, 13)).toBe(false);
    expect(CONNECTION_DRAG_THRESHOLD_PX).toBe(6);
  });

  test('starts a drag once the pointer travels far enough', () => {
    expect(shouldActivateConnectionDrag(0, 0, 6, 0)).toBe(true);
    expect(shouldActivateConnectionDrag(0, 0, 0, 8)).toBe(true);
  });
});

describe('connectionPointerUpKind', () => {
  test('connects when the pointer was released without dragging', () => {
    expect(connectionPointerUpKind(false)).toBe('connect');
  });

  test('drops instead of connecting after a drag', () => {
    expect(connectionPointerUpKind(true)).toBe('drop');
  });
});
