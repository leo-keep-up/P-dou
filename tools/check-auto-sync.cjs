const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../miniprogram');
const clone = value => JSON.parse(JSON.stringify(value));
function load(file, deps, name) {
  const code = stripTypeScriptTypes(fs.readFileSync(path.join(root, file), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(code + `\n;${name}`, { console, ...deps });
}
const prompt = { id: 'p1', content: '旧内容', tagIds: [], isFavorite: false,
  isDeleted: false, deletedAt: null, createdAt: 1, updatedAt: 1, cloudVersion: 1 };
let prompts, tags, meta, backups, cloud, uploadHook;
const localRepository = {
  getPrompts: () => clone(prompts), getTags: () => clone(tags), getSyncMeta: () => clone(meta),
  getBackups: () => clone(backups),
  savePrompts: v => { prompts = clone(v); }, saveTags: v => { tags = clone(v); },
  saveSyncMeta: v => { meta = clone(v); },
  createBackup: () => { backups.unshift({ prompts: clone(prompts), tags: clone(tags) }); }
};
const cloudRepository = {
  listPrompts: async () => clone(cloud), listTags: async () => [],
  setPrompt: async p => { cloud = [...cloud.filter(item => item.id !== p.id), clone(p)]; if (uploadHook) uploadHook(); },
  setTag: async () => {}
};
const sync = load('services/sync-service.ts', {
  createId: prefix => prefix + '_' + Math.random().toString(36).slice(2),
  localRepository, cloudRepository, isCloudConfigured: () => true,
  settingsService: { get: () => ({ cloudSyncEnabled: true }), update() {} }
}, 'syncService');
function reset() {
  prompts = [clone(prompt)]; tags = []; backups = []; cloud = [clone(prompt)]; uploadHook = null;
  cloud[0].content = '云端旧内容';
  meta = { deviceId: 'test', lastSyncAt: null, promptStates: { p1: { dirty: true, baseCloudVersion: 1 } }, tagStates: {} };
}
async function main() {
  reset();
  uploadHook = () => {
    prompts[0].content = '网络等待期间的新输入'; prompts[0].updatedAt = 2;
    prompts.push({ ...prompt, id: 'p2', cloudVersion: 0 });
    meta.promptStates.p2 = { dirty: true, baseCloudVersion: 0 };
  };
  const first = sync.sync();
  assert.equal(sync.sync(), first, 'concurrent sync must share one flight');
  await first;
  assert.equal(prompts[0].content, '网络等待期间的新输入');
  assert.equal(prompts[0].cloudVersion, 2);
  assert.equal(meta.promptStates.p1.dirty, true);
  assert.equal(meta.promptStates.p1.baseCloudVersion, 2);
  assert.equal(prompts.length, 2);
  assert.equal(meta.promptStates.p2.dirty, true);
  reset(); sync.setEditing(true);
  await sync.sync();
  assert.equal(cloud[0].content, '旧内容', 'saved drafts upload while editing');
  cloud[0].content = '另一设备修改'; cloud[0].cloudVersion = 4;
  await sync.sync();
  assert.equal(prompts[0].content, '旧内容', 'remote downloads must not replace an open editor');
  sync.setEditing(false);
  await sync.sync();
  assert.equal(prompts[0].content, '另一设备修改');
  reset(); sync.setEditing(true);
  cloud[0].cloudVersion = 3;
  await sync.sync();
  assert.equal(meta.promptStates.p1.dirty, true, 'conflicts remain pending during editing');
  assert.equal(prompts.length, 1);
  sync.setEditing(false);
  await sync.sync();
  assert.equal(prompts.filter(p => p.conflictOf).length, 1);
  reset();
  cloud[0] = { ...prompt, cloudVersion: 2 };
  await sync.sync();
  assert.equal(prompts.length, 1, 'lost response retry should not create a conflict copy');
  assert.equal(meta.promptStates.p1.dirty, false);
  reset(); cloud = [];
  await sync.sync();
  assert.equal(prompts.find(p => p.id === 'p1').isPurged, true);
  assert.equal(prompts.find(p => p.id === 'p1').content, '');
  assert.equal(prompts.find(p => p.conflictOf === 'p1').content, '旧内容');
  reset(); cloud[0].cloudVersion = 3; cloud[0].content = '云端版本';
  const conflict = await sync.sync();
  assert.equal(conflict.conflicts, 1);
  assert.equal(backups[0].prompts[0].content, '旧内容');
  assert.equal(prompts.find(p => p.id === 'p1').content, '云端版本');
  assert.equal(prompts.find(p => p.conflictOf === 'p1').content, '旧内容');
  assert.equal(meta.promptStates[prompts.find(p => p.conflictOf).id].dirty, true);
  await sync.sync();
  const count = backups.length;
  await sync.sync();
  assert.equal(backups.length, count, 'clean polls must not evict conflict backups');
  reset();
  cloudRepository.listPrompts = async () => { throw new Error('offline'); };
  await assert.rejects(sync.sync(), /offline/);
  assert.equal(prompts[0].content, '旧内容');
  assert.equal(meta.promptStates.p1.dirty, true);

  let pending, change, network, enabled = true, calls = 0, fail = false;
  const auto = load('services/auto-sync-service.ts', {
    setTimeout: (fn, delay) => { pending = { fn, delay }; return 1; },
    clearTimeout: () => { pending = null; },
    wx: { onNetworkStatusChange: fn => { network = fn; } },
    localRepository: { subscribeChanges: fn => { change = fn; }, getSyncMeta: () => ({ promptStates: {}, tagStates: {} }) },
    syncService: { setEditing() {}, getStatus: () => ({ enabled }), isConfigured: () => true,
      sync: async () => { calls++; if (fail) throw new Error('offline'); return { conflicts: 0 }; } },
    console: { error() {} }
  }, 'autoSyncService');
  auto.init(); auto.foreground(); assert.equal(pending.delay, 500);
  await pending.fn(); assert.equal(calls, 1); assert.equal(pending.delay, 60000);
  change(); assert.equal(pending.delay, 2000);
  auto.setEditing(true); assert.equal(pending.delay, 2000);
  change(); assert.equal(pending.delay, 2000);
  auto.setEditing(false); assert.equal(pending.delay, 2000);
  fail = true; await pending.fn(); assert.equal(pending.delay, 5000);
  await pending.fn(); assert.equal(pending.delay, 10000);
  network({ isConnected: true }); assert.equal(pending.delay, 500);
  auto.background(); assert.equal(pending, null);
  enabled = false; auto.foreground(); assert.equal(pending, null);

  const markup = fs.readFileSync(path.join(root, 'components/prompt-card/prompt-card.wxml'), 'utf8');
  assert.match(markup, /class="prompt-card" bindtap="copyPrompt"/);
  assert.match(markup, /catchtap="openDetail"/);
  assert.match(markup, /catchtap="toggleFavorite"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'pages/prompt-detail/prompt-detail.wxml'), 'utf8'), /copyPrompt/);
  console.log('PASS: single-tap bindings, single-flight, concurrent edits, conflicts/copies, offline retention, debounce, editor upload/download protection, lost response, legacy deletion, retry, opt-in. Mock tests only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
