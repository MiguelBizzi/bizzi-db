export function tableMatchesSearch(tableName: string, search: string): boolean {
  return tableName.toLowerCase().includes(search.toLowerCase());
}
