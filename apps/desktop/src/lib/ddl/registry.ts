import type { DatabaseDialect, TableSchema } from '../../types';
import { buildInsertSql, type InsertFieldState } from '../insertRow';
import * as mysqlIndexes from './mysql/indexDdl';
import * as mysqlRoutines from './mysql/routineDdl';
import * as mysqlTables from './mysql/tableDdl';
import * as mysqlViews from './mysql/viewDdl';
import * as postgresIndexes from './postgres/indexDdl';
import * as postgresRoutines from './postgres/routineDdl';
import * as postgresTables from './postgres/tableDdl';
import * as postgresViews from './postgres/viewDdl';
import * as sqlServerIndexes from './sqlserver/indexDdl';
import * as sqlServerRoutines from './sqlserver/routineDdl';
import * as sqlServerTables from './sqlserver/tableDdl';
import { buildSqlServerInsertSql } from './sqlserver/rowDml';
import * as sqlServerViews from './sqlserver/viewDdl';
import type { ObjectDdl } from './types';

export interface TableDdl {
  buildAddColumnSql: typeof postgresTables.buildAddColumnSql;
  buildAlterColumnSql: typeof postgresTables.buildAlterColumnSql;
  buildCreateTableSql: typeof postgresTables.buildCreateTableSql;
  buildDropColumnSql: typeof postgresTables.buildDropColumnSql;
  buildDropTableSql: typeof postgresTables.buildDropTableSql;
  buildTruncateTableSql: typeof postgresTables.buildTruncateTableSql;
  buildTableDdlPreview: typeof postgresTables.buildTableDdlPreview;
}

const POSTGRES_TABLES: TableDdl = {
  buildAddColumnSql: postgresTables.buildAddColumnSql,
  buildAlterColumnSql: postgresTables.buildAlterColumnSql,
  buildCreateTableSql: postgresTables.buildCreateTableSql,
  buildDropColumnSql: postgresTables.buildDropColumnSql,
  buildDropTableSql: postgresTables.buildDropTableSql,
  buildTruncateTableSql: postgresTables.buildTruncateTableSql,
  buildTableDdlPreview: postgresTables.buildTableDdlPreview,
};

const POSTGRES: ObjectDdl = {
  emptyIndexDraft: postgresIndexes.emptyIndexDraft,
  indexDraftFrom: postgresIndexes.indexDraftFrom,
  suggestIndexName: postgresIndexes.suggestIndexName,
  validateIndex: postgresIndexes.validateIndex,
  createIndex: postgresIndexes.createIndex,
  planIndexChange: postgresIndexes.planIndexChange,
  dropIndex: postgresIndexes.dropIndex,
  emptyRoutineDraft: postgresRoutines.emptyRoutineDraft,
  routineDraftFrom: postgresRoutines.routineDraftFrom,
  validateRoutine: postgresRoutines.validateRoutine,
  createRoutine: postgresRoutines.createRoutine,
  planRoutineChange: postgresRoutines.planRoutineChange,
  dropRoutine: postgresRoutines.dropRoutine,
  emptyViewDraft: postgresViews.emptyViewDraft,
  viewDraftFrom: postgresViews.viewDraftFrom,
  validateView: postgresViews.validateView,
  createView: postgresViews.createView,
  planViewChange: postgresViews.planViewChange,
  dropView: postgresViews.dropView,
};

const MYSQL_TABLES: TableDdl = {
  buildAddColumnSql: mysqlTables.buildAddColumnSql,
  buildAlterColumnSql: mysqlTables.buildAlterColumnSql,
  buildCreateTableSql: mysqlTables.buildCreateTableSql,
  buildDropColumnSql: mysqlTables.buildDropColumnSql,
  buildDropTableSql: mysqlTables.buildDropTableSql,
  buildTruncateTableSql: mysqlTables.buildTruncateTableSql,
  buildTableDdlPreview: mysqlTables.buildTableDdlPreview,
};

const MYSQL: ObjectDdl = {
  emptyIndexDraft: mysqlIndexes.emptyIndexDraft,
  indexDraftFrom: mysqlIndexes.indexDraftFrom,
  suggestIndexName: mysqlIndexes.suggestIndexName,
  validateIndex: mysqlIndexes.validateIndex,
  createIndex: mysqlIndexes.createIndex,
  planIndexChange: mysqlIndexes.planIndexChange,
  dropIndex: mysqlIndexes.dropIndex,
  emptyRoutineDraft: mysqlRoutines.emptyRoutineDraft,
  routineDraftFrom: mysqlRoutines.routineDraftFrom,
  validateRoutine: mysqlRoutines.validateRoutine,
  createRoutine: mysqlRoutines.createRoutine,
  planRoutineChange: mysqlRoutines.planRoutineChange,
  dropRoutine: mysqlRoutines.dropRoutine,
  emptyViewDraft: mysqlViews.emptyViewDraft,
  viewDraftFrom: mysqlViews.viewDraftFrom,
  validateView: mysqlViews.validateView,
  createView: mysqlViews.createView,
  planViewChange: mysqlViews.planViewChange,
  dropView: mysqlViews.dropView,
};

const SQLSERVER_TABLES: TableDdl = {
  buildAddColumnSql: sqlServerTables.buildAddColumnSql,
  buildAlterColumnSql: sqlServerTables.buildAlterColumnSql,
  buildCreateTableSql: sqlServerTables.buildCreateTableSql,
  buildDropColumnSql: sqlServerTables.buildDropColumnSql,
  buildDropTableSql: sqlServerTables.buildDropTableSql,
  buildTruncateTableSql: sqlServerTables.buildTruncateTableSql,
  buildTableDdlPreview: sqlServerTables.buildTableDdlPreview,
};

const SQLSERVER: ObjectDdl = {
  emptyIndexDraft: sqlServerIndexes.emptyIndexDraft,
  indexDraftFrom: sqlServerIndexes.indexDraftFrom,
  suggestIndexName: sqlServerIndexes.suggestIndexName,
  validateIndex: sqlServerIndexes.validateIndex,
  createIndex: sqlServerIndexes.createIndex,
  planIndexChange: sqlServerIndexes.planIndexChange,
  dropIndex: sqlServerIndexes.dropIndex,
  emptyRoutineDraft: sqlServerRoutines.emptyRoutineDraft,
  routineDraftFrom: sqlServerRoutines.routineDraftFrom,
  validateRoutine: sqlServerRoutines.validateRoutine,
  createRoutine: sqlServerRoutines.createRoutine,
  planRoutineChange: sqlServerRoutines.planRoutineChange,
  dropRoutine: sqlServerRoutines.dropRoutine,
  emptyViewDraft: sqlServerViews.emptyViewDraft,
  viewDraftFrom: sqlServerViews.viewDraftFrom,
  validateView: sqlServerViews.validateView,
  createView: sqlServerViews.createView,
  planViewChange: sqlServerViews.planViewChange,
  dropView: sqlServerViews.dropView,
};

const OBJECT_DDL: Partial<Record<DatabaseDialect, ObjectDdl>> = {
  PostgreSQL: POSTGRES,
  MySQL: MYSQL,
  SQLServer: SQLSERVER,
};

const TABLE_DDL: Partial<Record<DatabaseDialect, TableDdl>> = {
  PostgreSQL: POSTGRES_TABLES,
  MySQL: MYSQL_TABLES,
  SQLServer: SQLSERVER_TABLES,
};

const INSERT_SQL: Partial<
  Record<DatabaseDialect, (table: TableSchema, fields: Record<string, InsertFieldState>) => string>
> = {
  SQLServer: buildSqlServerInsertSql,
};

export function insertSqlFor(
  table: TableSchema,
  fields: Record<string, InsertFieldState>,
  dialect: DatabaseDialect,
): string {
  return INSERT_SQL[dialect]?.(table, fields) ?? buildInsertSql(table, fields, dialect);
}

export function objectDdlFor(dialect: DatabaseDialect): ObjectDdl | undefined {
  return OBJECT_DDL[dialect];
}

export function tableDdlFor(dialect: DatabaseDialect): TableDdl | undefined {
  return TABLE_DDL[dialect];
}
