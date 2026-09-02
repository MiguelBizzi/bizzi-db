export type ExplorerListMode = 'skeleton' | 'list' | 'empty';

export function explorerListMode(
  loading: boolean,
  tableCount: number
): ExplorerListMode {
  if (loading) return 'skeleton';
  return tableCount === 0 ? 'empty' : 'list';
}
