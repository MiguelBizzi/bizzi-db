export interface SqlGenerateResponse {
  sql: string;
  explanation: string;
  tablesUsed: string[];
  estimatedComplexity: 'Simple' | 'Moderate' | 'Complex';
  optimizationNotes?: string;
  error?: string;
}

export interface SqlExplainResponse {
  summary: string;
  stepByStep: string[];
  performanceAnalysis: string;
  columnsReturned: string[];
  error?: string;
}

export interface SqlOptimizeResponse {
  optimizedSql: string;
  improvements: string[];
  indexRecommendations: string[];
  estimatedPerformanceGain: string;
  error?: string;
}

export interface SqlFixResponse {
  fixedSql: string;
  rootCause: string;
  changesMade: string;
  error?: string;
}

export async function generateSqlWithAi(
  prompt: string,
  schemaContext: any,
  dialect: string = 'PostgreSQL'
): Promise<SqlGenerateResponse> {
  const res = await fetch('/api/ai/sql-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, schemaContext, dialect }),
  });
  if (!res.ok) {
    throw new Error('Server error generating SQL');
  }
  return res.json();
}

export async function explainSqlWithAi(
  sql: string,
  schemaContext: any,
  dialect: string = 'PostgreSQL'
): Promise<SqlExplainResponse> {
  const res = await fetch('/api/ai/sql-explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, schemaContext, dialect }),
  });
  if (!res.ok) {
    throw new Error('Server error explaining SQL');
  }
  return res.json();
}

export async function optimizeSqlWithAi(
  sql: string,
  schemaContext: any,
  dialect: string = 'PostgreSQL'
): Promise<SqlOptimizeResponse> {
  const res = await fetch('/api/ai/sql-optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, schemaContext, dialect }),
  });
  if (!res.ok) {
    throw new Error('Server error optimizing SQL');
  }
  return res.json();
}

export async function fixSqlWithAi(
  sql: string,
  errorMessage: string,
  schemaContext: any,
  dialect: string = 'PostgreSQL'
): Promise<SqlFixResponse> {
  const res = await fetch('/api/ai/sql-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, errorMessage, schemaContext, dialect }),
  });
  if (!res.ok) {
    throw new Error('Server error fixing SQL error');
  }
  return res.json();
}
