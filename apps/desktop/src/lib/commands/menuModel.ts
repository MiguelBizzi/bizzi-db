export type PredefinedKind =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'about'
  | 'services'
  | 'hide'
  | 'hideOthers'
  | 'showAll'
  | 'quit'
  | 'minimize'
  | 'maximize'
  | 'fullscreen'
  | 'bringAllToFront';

export type MenuNode =
  | { kind: 'item'; commandId: string }
  | { kind: 'separator' }
  | { kind: 'predefined'; item: PredefinedKind }
  | { kind: 'submenu'; id: string; label: string; items: MenuNode[]; role?: 'window' | 'help' };

const item = (commandId: string): MenuNode => ({ kind: 'item', commandId });
const predefined = (kind: PredefinedKind): MenuNode => ({ kind: 'predefined', item: kind });
const separator = (): MenuNode => ({ kind: 'separator' });

/** The neutral (macOS-shaped) menu model. Use `adaptMenuModel` for other platforms. */
export function buildMenuModel(): MenuNode[] {
  return [
    {
      kind: 'submenu',
      id: 'app',
      label: 'Bizzi DB',
      items: [
        predefined('about'),
        item('app.checkUpdates'),
        separator(),
        item('app.settings'),
        separator(),
        predefined('services'),
        separator(),
        predefined('hide'),
        predefined('hideOthers'),
        predefined('showAll'),
        separator(),
        predefined('quit'),
      ],
    },
    {
      kind: 'submenu',
      id: 'file',
      label: 'File',
      items: [
        item('file.newQuery'),
        separator(),
        item('file.saveQuery'),
        item('file.export'),
        separator(),
        item('file.closeTab'),
        item('file.closeOthers'),
        item('file.closeRight'),
        item('file.reopenTab'),
        separator(),
        item('file.closeWindow'),
      ],
    },
    {
      kind: 'submenu',
      id: 'edit',
      label: 'Edit',
      items: [
        predefined('undo'),
        predefined('redo'),
        separator(),
        predefined('cut'),
        predefined('copy'),
        predefined('paste'),
        separator(),
        predefined('selectAll'),
        separator(),
        item('edit.find'),
        item('edit.insertRow'),
        item('edit.deleteRows'),
        separator(),
        item('edit.toggleComment'),
        item('edit.formatSql'),
      ],
    },
    {
      kind: 'submenu',
      id: 'query',
      label: 'Query',
      items: [
        item('query.run'),
        item('query.runAll'),
        separator(),
        item('query.commit'),
        item('query.discard'),
        item('query.review'),
      ],
    },
    {
      kind: 'submenu',
      id: 'connection',
      label: 'Connection',
      items: [item('conn.refreshTable')],
    },
    {
      kind: 'submenu',
      id: 'view',
      label: 'View',
      items: [
        item('view.palette'),
        separator(),
        item('view.erd'),
        item('view.metrics'),
        item('view.activity'),
        separator(),
        item('view.nextTab'),
        item('view.prevTab'),
        {
          kind: 'submenu',
          id: 'view.goToTab',
          label: 'Go to Tab',
          items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => item(`view.tab.${n}`)),
        },
        separator(),
        item('view.splitRight'),
        item('view.splitDown'),
        separator(),
        predefined('fullscreen'),
      ],
    },
    {
      kind: 'submenu',
      id: 'window',
      label: 'Window',
      role: 'window',
      items: [predefined('minimize'), predefined('maximize'), separator(), predefined('bringAllToFront')],
    },
  ];
}
