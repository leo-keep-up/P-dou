const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
let definition, timer, listener, saved, editing;
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/prompt-editor/prompt-editor.ts'), 'utf8')).replace(/^import .*;\r?\n/gm, '');
vm.runInNewContext(source, {
  Page: value => { definition = value; }, console,
  setTimeout: (fn, delay) => { timer = { fn, delay }; return 1; }, clearTimeout() {},
  wx: { setNavigationBarTitle() {} },
  tagService: { listActive: () => [] },
  promptService: { get: () => undefined, save: input => { saved = input; return { ...input, id: 'p1' }; } },
  autoSyncService: { setEditing: value => { editing = value; },
    getState: () => ({ status: '已自动同步' }), subscribe: fn => { listener = fn; return () => {}; } }
});
const updates = [];
const page = { ...definition, data: { ...definition.data }, setData(v) { updates.push(v); Object.assign(this.data, v); } };
page.onLoad({}); page.onShow(); updates.length = 0;
page.handleInput({ detail: { value: '中文输入\n完整正文' } });
assert.equal(timer.delay, 5000);
timer.fn();
assert.equal(saved.content, '中文输入\n完整正文');
listener();
assert.ok(updates.every(v => !Object.hasOwn(v, 'content')), 'saving/sync must never write textarea content');
page.onHide(); assert.equal(editing, true);
page.onUnload(); assert.equal(editing, false);
console.log('PASS: local save debounce, full draft, no textarea writeback, background protection. Mock only; IME/cursor needs device test.');
