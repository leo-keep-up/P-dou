const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/sync-write/index.js'), 'utf8');
let document, owner = 'alice', writes = 0;
const cloud = {
  init() {}, getWXContext: () => ({ OPENID: owner }),
  database: () => ({ startTransaction: async () => ({
    collection: () => ({ doc: () => ({
      get: async () => ({ data: document }),
      set: async ({ data }) => { document = structuredClone(data); writes++; }
    }) }), commit: async () => {}, rollback: async () => {}
  }) })
};
const moduleExports = {};
vm.runInNewContext(source, { require: () => cloud, exports: moduleExports });
const record = { id: 'p1', content: '正文', tagIds: [], isFavorite: false, isDeleted: false,
  deletedAt: null, createdAt: 1, updatedAt: 1, cloudVersion: 1, _openid: 'mallory' };
const request = (r = record, v = 0) => moduleExports.main({ collection: 'prompts', record: r, expectedVersion: v });
(async () => {
  assert.equal((await request()).ok, true);
  assert.equal(document._openid, 'alice');
  assert.equal(document.cloudVersion, 1);
  assert.equal((await request()).ok, true);
  assert.equal(writes, 1, 'identical retry is idempotent');
  const changed = { ...record, content: '修改', updatedAt: 2 };
  assert.equal((await request(changed, 0)).conflict, true);
  assert.equal(document.content, '正文');
  owner = 'bob';
  await assert.rejects(request(changed, 1), /FORBIDDEN/);
  owner = '';
  await assert.rejects(request(), /UNAUTHENTICATED/);
  owner = 'alice';
  assert.equal((await request(changed, 1)).record.cloudVersion, 2);
  const purged = { ...changed, content: '', tagIds: [], isDeleted: true, isPurged: true, deletedAt: 3, updatedAt: 3 };
  assert.equal((await request(purged, 2)).ok, true);
  assert.equal((await request(changed, 3)).conflict, true, 'purged records cannot be resurrected');
  await assert.rejects(request({ ...record, id: '../bad' }), /INVALID_REQUEST/);
  await assert.rejects(request({ ...record, content: 42 }), /INVALID_PROMPT/);
  assert.equal(document.content, '');
  console.log('PASS: server ownership, validation, versions, idempotency, purge protection. Transaction behavior still needs cloud integration tests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
