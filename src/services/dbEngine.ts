import { MOCK_DATABASES, MOCK_TABLE_ROWS } from '../data/mockDatabases';
import { DatabaseSchema, QueryExecutionResult, ExplainPlanNode, ActivityLogItem, TableSchema, PendingModifications } from '../types';

class DatabaseEngineService {
  private databases: Record<string, DatabaseSchema> = JSON.parse(JSON.stringify(MOCK_DATABASES));
  private tableRows: Record<string, Record<string, any>[]> = JSON.parse(JSON.stringify(MOCK_TABLE_ROWS));
  private activityLogs: ActivityLogItem[] = [
    {
      id: 'log_01',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      databaseName: 'ecommerce_prod',
      query: 'SELECT * FROM users ORDER BY created_at DESC LIMIT 50;',
      type: 'SELECT',
      executionTimeMs: 14,
      rowsAffected: 8,
      status: 'SUCCESS',
      user: 'app_admin',
    },
    {
      id: 'log_02',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      databaseName: 'ecommerce_prod',
      query: 'SELECT * FROM orders WHERE status = \'shipped\';',
      type: 'SELECT',
      executionTimeMs: 22,
      rowsAffected: 4,
      status: 'SUCCESS',
      user: 'app_admin',
    }
  ];

  private pendingByTable: Record<string, PendingModifications> = {};

  public getDatabases(): DatabaseSchema[] {
    return Object.values(this.databases);
  }

  public getDatabase(id: string): DatabaseSchema | undefined {
    return this.databases[id];
  }

  public getActivityLogs(): ActivityLogItem[] {
    return [...this.activityLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getTableRows(tableName: string): Record<string, any>[] {
    return this.tableRows[tableName] || [];
  }

  public getPendingModifications(tableName: string): PendingModifications {
    if (!this.pendingByTable[tableName]) {
      this.pendingByTable[tableName] = { updates: [], inserts: [], deletes: [] };
    }
    return this.pendingByTable[tableName];
  }

  public stageCellUpdate(
    tableName: string,
    primaryKeyValue: any,
    columnName: string,
    oldValue: any,
    newValue: any
  ): void {
    const pending = this.getPendingModifications(tableName);
    if (columnName === 'DELETE_ROW') {
      pending.deletes.push({
        rowId: primaryKeyValue,
        primaryKeyValue,
        rowData: {},
      });
      return;
    }

    const existingIndex = pending.updates.findIndex(
      (u) => String(u.primaryKeyValue) === String(primaryKeyValue) && u.columnName === columnName
    );

    if (existingIndex !== -1) {
      pending.updates[existingIndex].newValue = newValue;
    } else {
      pending.updates.push({
        rowId: primaryKeyValue,
        primaryKeyValue,
        columnName,
        oldValue,
        newValue,
      });
    }
  }

  public clearPendingModifications(tableName: string): void {
    this.pendingByTable[tableName] = { updates: [], inserts: [], deletes: [] };
  }

  // Execute DML / Query with simulated latency
  public async executeQuery(arg1: string, arg2?: string): Promise<QueryExecutionResult> {
    let databaseId = 'ecommerce_prod';
    let rawSql = arg1;

    if (arg2) {
      if (this.databases[arg1]) {
        databaseId = arg1;
        rawSql = arg2;
      } else if (this.databases[arg2]) {
        databaseId = arg2;
        rawSql = arg1;
      } else {
        rawSql = arg1;
        databaseId = 'ecommerce_prod';
      }
    }
    const startTime = performance.now();
    const cleanSql = rawSql.trim();
    const upperSql = cleanSql.toUpperCase();

    // Small artificial database round-trip delay
    await new Promise((res) => setTimeout(res, Math.floor(Math.random() * 25) + 10));

    let result: QueryExecutionResult = {
      id: 'res_' + Math.random().toString(36).substring(2, 9),
      query: rawSql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 0,
    };

    try {
      if (upperSql.startsWith('EXPLAIN') || upperSql.startsWith('EXPLAIN ANALYZE')) {
        result = this.handleExplainQuery(databaseId, cleanSql);
      } else if (upperSql.startsWith('SELECT') || upperSql.startsWith('WITH')) {
        result = this.handleSelectQuery(databaseId, cleanSql);
      } else if (upperSql.startsWith('INSERT')) {
        result = this.handleInsertQuery(databaseId, cleanSql);
      } else if (upperSql.startsWith('UPDATE')) {
        result = this.handleUpdateQuery(databaseId, cleanSql);
      } else if (upperSql.startsWith('DELETE')) {
        result = this.handleDeleteQuery(databaseId, cleanSql);
      } else if (upperSql.startsWith('CREATE TABLE') || upperSql.startsWith('ALTER TABLE') || upperSql.startsWith('DROP TABLE')) {
        result = this.handleDdlQuery(databaseId, cleanSql);
      } else {
        // Fallback generic SELECT table lookup
        result = this.handleSelectQuery(databaseId, cleanSql);
      }

      result.executionTimeMs = Math.round((performance.now() - startTime) * 10) / 10;

      // Log activity
      this.addActivityLog({
        id: 'log_' + Date.now(),
        timestamp: result.timestamp,
        databaseName: databaseId,
        query: cleanSql,
        type: upperSql.startsWith('SELECT') ? 'SELECT' : upperSql.startsWith('INSERT') ? 'INSERT' : upperSql.startsWith('UPDATE') ? 'UPDATE' : upperSql.startsWith('DELETE') ? 'DELETE' : 'DDL',
        executionTimeMs: result.executionTimeMs,
        rowsAffected: result.affectedRows ?? (result.rows?.length || 0),
        status: 'SUCCESS',
        user: 'app_admin',
      });

      return result;
    } catch (err: any) {
      const execTime = Math.round((performance.now() - startTime) * 10) / 10;
      this.addActivityLog({
        id: 'log_' + Date.now(),
        timestamp: new Date().toISOString(),
        databaseName: databaseId,
        query: cleanSql,
        type: 'SYSTEM',
        executionTimeMs: execTime,
        rowsAffected: 0,
        status: 'ERROR',
        errorMessage: err.message,
        user: 'app_admin',
      });

      return {
        id: 'res_err_' + Date.now(),
        query: rawSql,
        timestamp: new Date().toISOString(),
        executionTimeMs: execTime,
        error: err.message || 'Syntax error near query',
      };
    }
  }

  // Handle SELECT parsing
  private handleSelectQuery(databaseId: string, sql: string): QueryExecutionResult {
    const db = this.databases[databaseId];
    let matchedTable: TableSchema | undefined;

    if (db) {
      for (const t of db.tables) {
        if (sql.toLowerCase().includes(t.name.toLowerCase())) {
          matchedTable = t;
          break;
        }
      }
    }

    if (!matchedTable) {
      // Default to users table if present, else first table
      matchedTable = db?.tables[0];
    }

    const tableName = matchedTable ? matchedTable.name : 'users';
    const rawRows = this.tableRows[tableName] || [];
    let rows = [...rawRows];

    // Simple WHERE filtering parser
    if (sql.toUpperCase().includes('WHERE')) {
      const wherePart = sql.substring(sql.toUpperCase().indexOf('WHERE') + 5).split(/ORDER BY|LIMIT|GROUP BY/i)[0].trim();
      if (wherePart.includes('=')) {
        const [colRaw, valRaw] = wherePart.split('=').map((s) => s.trim().replace(/['";]/g, ''));
        rows = rows.filter((r) => String(r[colRaw]).toLowerCase() === valRaw.toLowerCase());
      }
    }

    // Limit clause
    let limit = 100;
    if (sql.toUpperCase().includes('LIMIT')) {
      const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
      }
    }
    rows = rows.slice(0, limit);

    const columns = matchedTable
      ? matchedTable.columns.map((c) => c.name)
      : rows.length > 0
      ? Object.keys(rows[0])
      : ['id', 'name', 'status'];

    return {
      id: 'res_' + Date.now(),
      query: sql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 12,
      columns,
      rows,
      affectedRows: rows.length,
    };
  }

  // Handle EXPLAIN ANALYZE
  private handleExplainQuery(databaseId: string, sql: string): QueryExecutionResult {
    const isOrders = sql.toLowerCase().includes('orders');
    const isUsers = sql.toLowerCase().includes('users');

    const explainPlan: ExplainPlanNode = {
      nodeType: 'Limit',
      startupCost: 0.15,
      totalCost: 18.45,
      planRows: 50,
      planWidth: 142,
      actualStartupTimeMs: 0.08,
      actualTotalTimeMs: 2.14,
      actualRows: 8,
      children: [
        {
          nodeType: 'Sort',
          startupCost: 12.10,
          totalCost: 18.20,
          planRows: 142,
          planWidth: 142,
          actualStartupTimeMs: 0.95,
          actualTotalTimeMs: 1.82,
          actualRows: 8,
          filter: 'Sort Key: created_at DESC',
          children: [
            {
              nodeType: isOrders || isUsers ? 'Index Scan' : 'Seq Scan',
              relationName: isOrders ? 'orders' : isUsers ? 'users' : 'products',
              indexName: isOrders ? 'orders_user_created_idx' : isUsers ? 'users_pkey' : undefined,
              indexCond: isOrders ? '(user_id = \'usr_81a2f4a1\'::uuid)' : undefined,
              startupCost: 0.28,
              totalCost: 11.80,
              planRows: 142,
              planWidth: 142,
              actualStartupTimeMs: 0.12,
              actualTotalTimeMs: 0.88,
              actualRows: 8,
            },
          ],
        },
      ],
    };

    return {
      id: 'res_explain_' + Date.now(),
      query: sql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 8.5,
      explainPlan,
    };
  }

  // Handle INSERT
  private handleInsertQuery(databaseId: string, sql: string): QueryExecutionResult {
    return {
      id: 'res_ins_' + Date.now(),
      query: sql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 18.2,
      affectedRows: 1,
    };
  }

  // Handle UPDATE
  private handleUpdateQuery(databaseId: string, sql: string): QueryExecutionResult {
    return {
      id: 'res_upd_' + Date.now(),
      query: sql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 15.4,
      affectedRows: 2,
    };
  }

  // Handle DELETE
  private handleDeleteQuery(databaseId: string, sql: string): QueryExecutionResult {
    return {
      id: 'res_del_' + Date.now(),
      query: sql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 12.1,
      affectedRows: 1,
    };
  }

  // Handle DDL
  private handleDdlQuery(databaseId: string, sql: string): QueryExecutionResult {
    return {
      id: 'res_ddl_' + Date.now(),
      query: sql,
      timestamp: new Date().toISOString(),
      executionTimeMs: 45.0,
      affectedRows: 0,
    };
  }

  // Commit pending spreadsheet modifications (Diff Commit)
  public async commitModifications(
    arg1: string,
    arg2?: string,
    arg3?: PendingModifications
  ): Promise<{ sqlDiff: string; rowsAffected: number }> {
    let databaseId = 'ecommerce_prod';
    let tableName = arg1;
    let modifications = arg3;

    if (arg2 && typeof arg2 === 'string') {
      databaseId = arg1;
      tableName = arg2;
      modifications = arg3 || this.getPendingModifications(tableName);
    } else {
      tableName = arg1;
      modifications = this.getPendingModifications(tableName);
    }

    const db = this.databases[databaseId] || Object.values(this.databases)[0];
    const table = db?.tables.find((t) => t.name === tableName);
    const pkCol = table?.columns.find((c) => c.isPrimary)?.name || 'id';

    const sqlLines: string[] = [];
    let rowsAffected = 0;

    const rows = this.tableRows[tableName] || [];

    // Apply updates
    for (const update of modifications.updates) {
      const rowIndex = rows.findIndex((r) => String(r[pkCol]) === String(update.primaryKeyValue));
      if (rowIndex !== -1) {
        rows[rowIndex][update.columnName] = update.newValue;
        sqlLines.push(
          `UPDATE ${tableName} SET ${update.columnName} = ${this.formatSqlValue(update.newValue)} WHERE ${pkCol} = ${this.formatSqlValue(update.primaryKeyValue)};`
        );
        rowsAffected++;
      }
    }

    // Apply inserts
    for (const insert of modifications.inserts) {
      rows.push(insert.data);
      const cols = Object.keys(insert.data);
      const vals = Object.values(insert.data).map((v) => this.formatSqlValue(v));
      sqlLines.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
      rowsAffected++;
    }

    // Apply deletes
    for (const del of modifications.deletes) {
      const rowIndex = rows.findIndex((r) => String(r[pkCol]) === String(del.primaryKeyValue));
      if (rowIndex !== -1) {
        rows.splice(rowIndex, 1);
        sqlLines.push(`DELETE FROM ${tableName} WHERE ${pkCol} = ${this.formatSqlValue(del.primaryKeyValue)};`);
        rowsAffected++;
      }
    }

    this.tableRows[tableName] = rows;
    this.clearPendingModifications(tableName);
    const fullSql = sqlLines.join('\n');

    this.addActivityLog({
      id: 'log_commit_' + Date.now(),
      timestamp: new Date().toISOString(),
      databaseName: databaseId,
      query: fullSql || `-- Commit ${tableName} modifications`,
      type: 'UPDATE',
      executionTimeMs: 18,
      rowsAffected,
      status: 'SUCCESS',
      user: 'app_admin',
    });

    return { sqlDiff: fullSql, rowsAffected };
  }

  // Create new table schema
  public createTableSchema(databaseId: string, newTable: TableSchema): void {
    const db = this.databases[databaseId];
    if (db) {
      db.tables.push(newTable);
      this.tableRows[newTable.name] = [];
      this.addActivityLog({
        id: 'log_tbl_' + Date.now(),
        timestamp: new Date().toISOString(),
        databaseName: databaseId,
        query: `CREATE TABLE ${newTable.name} (\n  ${newTable.columns.map((c) => `${c.name} ${c.type}`).join(',\n  ')}\n);`,
        type: 'DDL',
        executionTimeMs: 35,
        rowsAffected: 0,
        status: 'SUCCESS',
        user: 'app_admin',
      });
    }
  }

  // Add tag to table
  public addTagToTable(databaseId: string, tableName: string, tag: string): void {
    const db = this.databases[databaseId];
    const table = db?.tables.find((t) => t.name === tableName);
    if (table && !table.tags.includes(tag)) {
      table.tags.push(tag);
    }
  }

  // Remove tag from table
  public removeTagFromTable(databaseId: string, tableName: string, tag: string): void {
    const db = this.databases[databaseId];
    const table = db?.tables.find((t) => t.name === tableName);
    if (table) {
      table.tags = table.tags.filter((t) => t !== tag);
    }
  }

  private addActivityLog(item: ActivityLogItem) {
    this.activityLogs.unshift(item);
    if (this.activityLogs.length > 200) {
      this.activityLogs.pop();
    }
  }

  private formatSqlValue(val: any): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
  }
}

export const dbEngine = new DatabaseEngineService();
