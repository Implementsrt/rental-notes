import { isHomeId, normalizeHome, uuid } from './model.js';

export function restoreStoredItems(stored, serverBacked = false) {
  if (stored?.version !== 1 || !stored.items || typeof stored.items !== 'object' || Array.isArray(stored.items)) {
    throw new Error('本机记录格式异常');
  }
  const items = {};
  const occupied = new Set(Object.keys(stored.items).filter(isHomeId));
  let repaired = false;
  for (const [key, item] of Object.entries(stored.items)) {
    if (typeof item?.deleted !== 'boolean' || !Number.isInteger(item.revision) || item.revision < 0) {
      throw new Error('本机记录格式异常');
    }
    const data = item.deleted ? null : normalizeHome(item.data);
    const embedded = data && item.data.id;
    let id = key;
    let record = {...item, data};
    if (!isHomeId(id)) {
      if (isHomeId(embedded) && !occupied.has(embedded)) {
        id = embedded;
      } else {
        do { id = uuid(); } while (occupied.has(id));
        record = {...record, revision:0, dirty:serverBacked && !item.deleted};
      }
      occupied.add(id);
    }
    if (data) data.id = id;
    repaired ||= id !== key || (data !== null && embedded !== id);
    items[id] = record;
  }
  return {items, repaired};
}

export function mergeBackup(items, homes, serverBacked = false, now = Date.now()) {
  const imported = new Map();
  for (const home of homes) {
    const local = items[home.id];
    const incomingTime = Date.parse(home.updatedAt);
    const pending = imported.get(home.id);
    if (pending) {
      if (!Number.isFinite(incomingTime) || incomingTime <= Date.parse(pending.updatedAt)) continue;
    } else if (local) {
      const localTime = local.deleted ? local.modifiedAt || Infinity : Date.parse(local.data.updatedAt);
      if (!Number.isFinite(incomingTime) || incomingTime <= localTime) continue;
    }
    imported.set(home.id, home);
  }
  let updated = 0;
  for (const [id, home] of imported) {
    const local = items[id];
    if (local) updated++;
    items[id] = {
      data:home, revision:local?.revision ?? 0, deleted:false, dirty:serverBacked,
      modifiedAt:Math.max(now, (local?.modifiedAt || 0) + 1),
    };
  }
  return {added:imported.size - updated, updated, skipped:homes.length - imported.size};
}

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
