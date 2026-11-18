import { normalizeHome, uuid } from './model.js';

export function reconcile(items, remote) {
  let conflicts = 0;
  for (const record of remote) {
    const local = items[record.id];
    if (local?.dirty && local.revision === record.revision) continue;
    if (local?.dirty) {
      // Preserve local edits as a new home. Never overwrite a concurrent edit or
      // re-delete a home which another device has updated since our last read.
      if (!local.deleted) {
        const copy = structuredClone(local.data);
        copy.id = uuid();
        copy.name = `${copy.name || '未命名房源'}（本机副本）`;
        copy.updatedAt = new Date().toISOString();
        items[copy.id] = {data: copy, revision: 0, deleted: false, dirty: true, modifiedAt:Date.now()};
      }
      conflicts++;
    }
    items[record.id] = {data: record.deleted ? null : normalizeHome(record.data), revision: record.revision, deleted: record.deleted, dirty: false, modifiedAt:record.modifiedAt || 0};
  }
  return conflicts;
}

export function acknowledge(items, id, sent, revision) {
  const current = items[id];
  if (!current || current.revision !== sent.revision) return;
  current.revision = revision;
  current.dirty = current.deleted !== sent.deleted || JSON.stringify(current.data) !== JSON.stringify(sent.data);
}
