const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLLECTIONS = ['prompts', 'tags'];

function isMissingCollection(error) {
  const code = Number(error && (error.errCode ?? error.code));
  const message = String(error && (error.errMsg || error.message || error));
  return code === -502005 || /collection.*not.*exist|集合.*不存在/i.test(message);
}

function isExistingCollection(error) {
  const message = String(error && (error.errMsg || error.message || error));
  return /already.*exist|collection.*exists|集合.*已存在/i.test(message);
}

async function ensureCollection(database, name) {
  try {
    await database.collection(name).limit(1).get();
    return { name, created: false };
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
    try {
      await database.createCollection(name);
      return { name, created: true };
    } catch (createError) {
      if (isExistingCollection(createError)) return { name, created: false };
      throw createError;
    }
  }
}

exports.main = async () => {
  const database = cloud.database();
  const collections = [];
  for (const name of COLLECTIONS) {
    collections.push(await ensureCollection(database, name));
  }
  return { ok: true, collections };
};
