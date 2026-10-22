const NO_DRAG_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);

type DragNode = {
  tagName: string;
  getAttribute(name: string): string | null;
  parentElement: DragNode | null;
};

function asDragNode(target: EventTarget | null): DragNode | null {
  let current: unknown = target;
  while (current && typeof current === 'object') {
    const node = current as {
      tagName?: unknown;
      getAttribute?: unknown;
      parentElement?: unknown;
    };
    if (
      typeof node.tagName === 'string' &&
      typeof node.getAttribute === 'function'
    ) {
      return node as DragNode;
    }
    current = node.parentElement ?? null;
  }
  return null;
}

function isControl(node: DragNode): boolean {
  if (NO_DRAG_TAGS.has(node.tagName.toUpperCase())) return true;
  if (node.getAttribute('role') === 'button') return true;
  return node.getAttribute('data-no-drag') != null;
}

export function shouldStartWindowDrag(target: EventTarget | null): boolean {
  let node = asDragNode(target);
  while (node) {
    if (isControl(node)) return false;
    if (node.getAttribute('data-tauri-drag-region') != null) return true;
    node = node.parentElement;
  }
  return false;
}

export function handleTitlebarMouseDown(
  event: {
    button: number;
    detail: number;
    target: EventTarget | null;
    preventDefault: () => void;
  },
  startDrag: () => void,
  toggleMaximize?: () => void
): void {
  if (event.button !== 0) return;
  if (event.detail === 2) {
    // Tauri's injected drag script already toggles maximize when the region element itself is hit.
    const target = asDragNode(event.target);
    if (
      toggleMaximize &&
      target &&
      target.getAttribute('data-tauri-drag-region') == null &&
      shouldStartWindowDrag(event.target)
    ) {
      event.preventDefault();
      toggleMaximize();
    }
    return;
  }
  if (event.detail !== 1) return;
  if (!shouldStartWindowDrag(event.target)) return;
  event.preventDefault();
  startDrag();
}
