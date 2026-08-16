import { getPreviousSnapshot as localGetPreviousSnapshot, getSnapshotById as localGetSnapshotById, historyStats as localHistoryStats, listSnapshots as localListSnapshots, saveSnapshot as localSaveSnapshot, snapshotSummary } from './history.mjs';
import { remoteGetPreviousSnapshot, remoteGetSnapshotById, remoteHistoryStats, remoteListSnapshots, remoteSaveSnapshot, remoteStorageEnabled } from './storage.mjs';

export async function saveSnapshotPersistent(snapshot, options = {}) {
  if (!options.filePath && remoteStorageEnabled()) return remoteSaveSnapshot(snapshot);
  return localSaveSnapshot(snapshot, options);
}

export async function listSnapshotsPersistent(options = {}) {
  if (!options.filePath && remoteStorageEnabled()) {
    const snapshots = await remoteListSnapshots(options);
    return snapshots.map(snapshotSummary);
  }
  return localListSnapshots(options);
}

export async function getSnapshotByIdPersistent(id, options = {}) {
  if (!options.filePath && remoteStorageEnabled()) return remoteGetSnapshotById(id);
  return localGetSnapshotById(id, options);
}

export async function getPreviousSnapshotPersistent(snapshot, options = {}) {
  if (!options.filePath && remoteStorageEnabled()) return remoteGetPreviousSnapshot(snapshot);
  return localGetPreviousSnapshot(snapshot, options);
}

export async function historyStatsPersistent(options = {}) {
  if (!options.filePath && remoteStorageEnabled()) {
    const stats = await remoteHistoryStats();
    return { ...stats, persistence: 'supabase', filePath: null };
  }
  const stats = await localHistoryStats(options);
  return { ...stats, persistence: 'local-json' };
}
