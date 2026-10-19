import type { DatabaseDialect } from '../../types';
import * as postgresIndexes from './postgres/indexDdl';
import * as postgresRoutines from './postgres/routineDdl';
import * as postgresViews from './postgres/viewDdl';
import type { ObjectDdl } from './types';

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

export function objectDdlFor(dialect: DatabaseDialect): ObjectDdl | undefined {
  return dialect === 'PostgreSQL' ? POSTGRES : undefined;
}
