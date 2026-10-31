import type { DatabaseDialect } from '../../types';
import * as mysqlIndexes from './mysql/indexDdl';
import * as mysqlRoutines from './mysql/routineDdl';
import * as mysqlTables from './mysql/tableDdl';
import * as mysqlViews from './mysql/viewDdl';
import * as postgresIndexes from './postgres/indexDdl';
import * as postgresRoutines from './postgres/routineDdl';
import * as postgresTables from './postgres/tableDdl';
import * as postgresViews from './postgres/viewDdl';
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

export function objectDdlFor(dialect: DatabaseDialect): ObjectDdl | undefined {
  if (dialect === 'PostgreSQL') return POSTGRES;
  if (dialect === 'MySQL') return MYSQL;
  return undefined;
}

export function tableDdlFor(dialect: DatabaseDialect): TableDdl | undefined {
  if (dialect === 'PostgreSQL') return POSTGRES_TABLES;
  if (dialect === 'MySQL') return MYSQL_TABLES;
  return undefined;
}
