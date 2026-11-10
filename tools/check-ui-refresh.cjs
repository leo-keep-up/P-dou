const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../miniprogram');
const files = fs.readdirSync(root, { recursive: true }).filter(f => fs.statSync(path.join(root, f)).isFile());
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (file.endsWith('.json')) JSON.parse(source);
  if (file.endsWith('.ts') && !file.endsWith('.d.ts')) stripTypeScriptTypes(source);
}
function component(name) {
  let definition;
  vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(path.join(root, 'components', name, name + '.ts'), 'utf8')), {
    Component: value => { definition = value; }
  });
  return definition;
}
const card = component('prompt-card');
let event;
const interaction = { data: { prompt: { id: 'p1', content: '完整正文\n第二行\n第三行' } },
  triggerEvent(name, payload) { event = { name, payload }; } };
card.methods.copyPrompt.call(interaction);
assert.equal(event.name, 'copy');
assert.equal(event.payload.content, interaction.data.prompt.content);
card.methods.toggleFavorite.call(interaction);
assert.equal(event.name, 'favorite');
card.methods.openDetail.call(interaction);
assert.equal(event.name, 'open');
let state;
const context = { setData(value) { state = value; } };
card.observers.prompt.call(context, { content: '周报生成\n整理本周工作\n给出下周计划' });
assert.equal(state.headline, '周报生成');
assert.equal(state.excerpt, '整理本周工作 给出下周计划');
card.observers.prompt.call(context, { content: '单行正文' });
assert.equal(state.excerpt, '单行正文');
card.observers.prompt.call(context, null);
assert.equal(state.headline, '空白提示词');
const tag = component('tag-pill');
for (const [name, tone] of [['写作', 0], ['工作', 1], ['学习', 2], ['生活', 3]]) {
  tag.observers.label.call(context, name);
  assert.equal(state.tone, tone);
}
tag.observers.label.call(context, '自定义标签');
const firstTone = state.tone;
tag.observers.label.call(context, '自定义标签');
assert.equal(state.tone, firstTone);
let home;
const homeSource = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'pages/home/home.ts'), 'utf8')).replace(/^import .*;\r?\n/gm, '');
let destination;
vm.runInNewContext(homeSource, { Page: value => { home = value; }, wx: { navigateTo: value => { destination = value.url; } } });
const page = { data: { query: '保留搜索', selectedTagIds: ['tag'], favoritesOnly: true }, setData(v) { Object.assign(this.data, v); }, refresh() {} };
home.showAll.call(page);
assert.equal(page.data.selectedTagIds.length, 0);
assert.equal(page.data.favoritesOnly, false);
assert.equal(page.data.query, '保留搜索');
home.manageTags.call(page);
assert.equal(destination, '/pages/tags/tags');
home.changeListMode.call(page, { currentTarget: { dataset: { mode: 'favorite' } } });
assert.equal(page.data.favoritesOnly, true);
assert.ok(fs.existsSync(path.join(root, 'assets/pdou-icon.png')));
console.log('PASS: TS syntax, JSON, prompt previews, tag colors, home filters and navigation. Not a WeChat runtime test.');
