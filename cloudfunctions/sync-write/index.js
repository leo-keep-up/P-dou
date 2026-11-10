const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) throw new Error('UNAUTHENTICATED');
  const { collection, record, expectedVersion } = event;
  if (!['prompts', 'tags'].includes(collection) || !record ||
      typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(record.id) ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('INVALID_REQUEST');
  const fields = collection === 'prompts'
    ? ['id', 'content', 'tagIds', 'isFavorite', 'isDeleted', 'deletedAt', 'createdAt', 'updatedAt', 'isPurged', 'conflictOf']
    : ['id', 'name', 'normalizedName', 'isDeleted', 'deletedAt', 'createdAt', 'updatedAt'];
  const data = {};
  fields.forEach(key => { if (record[key] !== undefined) data[key] = record[key]; });
  if (typeof data.isDeleted !== 'boolean' || !Number.isFinite(data.createdAt) || !Number.isFinite(data.updatedAt) ||
      (data.deletedAt !== null && !Number.isFinite(data.deletedAt))) throw new Error('INVALID_RECORD');
  if (collection === 'prompts' && (typeof data.content !== 'string' || data.content.length > 500000 ||
      !Array.isArray(data.tagIds) || data.tagIds.length > 1000 || data.tagIds.some(id => typeof id !== 'string') ||
      typeof data.isFavorite !== 'boolean' || (data.isPurged !== undefined && typeof data.isPurged !== 'boolean') ||
      (data.conflictOf !== undefined && typeof data.conflictOf !== 'string') ||
      (data.isPurged && (!data.isDeleted || data.content || data.tagIds.length)))) throw new Error('INVALID_PROMPT');
  if (collection === 'tags' && (typeof data.name !== 'string' || data.name.length > 100 ||
      typeof data.normalizedName !== 'string')) throw new Error('INVALID_TAG');
  const db = cloud.database({ throwOnNotFound: false });
  const tx = await db.startTransaction();
  try {
    const ref = tx.collection(collection).doc(data.id);
    const response = await ref.get();
    const current = Array.isArray(response.data) ? response.data[0] : response.data;
    // Cloud functions bypass database rules. Ownership must be verified here.
    if (current && current._openid !== OPENID) throw new Error('FORBIDDEN');
    const visible = current && Object.fromEntries(Object.entries(current).filter(([key]) => !['_id', '_openid'].includes(key)));
    // A response can be lost after commit; an identical retry must not create a conflict.
    if (current && fields.every(key => JSON.stringify(current[key]) === JSON.stringify(data[key]))) {
      await tx.commit();
      return { ok: true, record: visible };
    }
    if ((current ? current.cloudVersion : 0) !== expectedVersion || (current && current.isPurged)) {
      await tx.commit();
      return { ok: false, conflict: true, record: visible || null };
    }
    data.cloudVersion = expectedVersion + 1;
    await ref.set({ data: { ...data, _openid: OPENID } });
    await tx.commit();
    return { ok: true, record: data };
  } catch (error) {
    try { await tx.rollback(); } catch (_) { /* already closed */ }
    throw error;
  }
};
