/** Compact display names for verbose PostgreSQL `format_type` strings. */
export function shortColumnType(sqlType: string): string {
  return sqlType
    .replace(/\btimestamp(\(\d+\))?\s+with\s+time\s+zone\b/gi, 'timestamptz$1')
    .replace(/\btimestamp(\(\d+\))?\s+without\s+time\s+zone\b/gi, 'timestamp$1')
    .replace(/\btime(\(\d+\))?\s+with\s+time\s+zone\b/gi, 'timetz$1')
    .replace(/\btime(\(\d+\))?\s+without\s+time\s+zone\b/gi, 'time$1');
}
