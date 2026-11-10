import { PromptView, Tag } from '../../models/index';
import { deleteUndoService } from '../../services/delete-undo-service';
import { promptService } from '../../services/prompt-service';
import { buildPromptViews } from '../../services/search-service';
import { settingsService } from '../../services/settings-service';
import { appStore } from '../../store/app-store';
import { copyText } from '../../utils/copy';
import { autoSyncService } from '../../services/auto-sync-service';

interface TagOption extends Tag {
  selected: boolean;
}

Page({
  undoTimer: 0 as any,

  data: {
    query: '',
    showCopyHint: false,
    selectedTagIds: [] as string[],
    tagOptions: [] as TagOption[],
    prompts: [] as PromptView[],
    totalCount: 0,
    favoritesOnly: false,
    listTitle: '最近提示词',
    emptyTitle: '写下第一条提示词',
    emptyText: '单击提示词即可复制，点击“…”查看详情或编辑。',
    showUndo: false,
    undoPreview: ''
  },

  onLoad(options: Record<string, string>) {
    const settings = settingsService.get();
    this.setData({
      showCopyHint: !wx.getStorageSync('pdou_copy_hint_v1'),
      selectedTagIds: options.tagId ? [options.tagId] : [],
      favoritesOnly: options.tagId ? false : settings.defaultList === 'favorite'
    });
  },

  onShow() {
    this.unsubscribeSync = autoSyncService.subscribe(() => this.refresh());
    this.refresh();
    this.showPendingUndo();
  },

  onHide() {
    if (this.unsubscribeSync) this.unsubscribeSync();
    if (this.undoTimer) clearTimeout(this.undoTimer);
  },

  onUnload() {
    if (this.unsubscribeSync) this.unsubscribeSync();
    if (this.undoTimer) clearTimeout(this.undoTimer);
  },

  refresh() {
    const state = appStore.refresh();
    const activeTags = state.tags.filter(tag => !tag.isDeleted);
    const selected = this.data.selectedTagIds.filter((id: string) => activeTags.some(tag => tag.id === id));
    const matchedPrompts = buildPromptViews(state.prompts, activeTags, {
      query: this.data.query,
      selectedTagIds: selected
    });
    const prompts = this.data.favoritesOnly
      ? matchedPrompts.filter(prompt => prompt.isFavorite)
      : matchedPrompts;
    const totalCount = state.prompts.filter(prompt => !prompt.isDeleted).length;
    const hasFilters = Boolean(this.data.query || selected.length);
    const emptyTitle = totalCount === 0
      ? '写下第一条提示词'
      : this.data.favoritesOnly && !hasFilters
        ? '还没有收藏的提示词'
        : '没有匹配的提示词';
    const emptyText = totalCount === 0
      ? '单击提示词即可复制，点击“…”查看详情或编辑。'
      : this.data.favoritesOnly && !hasFilters
        ? '在提示词卡片或详情页点击星标，即可加入收藏。'
        : '换个关键词，或者清除标签筛选后再看看。';

    this.setData({
      selectedTagIds: selected,
      tagOptions: activeTags.map(tag => ({ ...tag, selected: selected.includes(tag.id) })),
      prompts,
      totalCount,
      listTitle: hasFilters ? '筛选结果' : this.data.favoritesOnly ? '我的收藏' : '最近提示词',
      emptyTitle,
      emptyText
    });
  },

  handleSearch(event: any) {
    this.setData({ query: event.detail.value });
    this.refresh();
  },

  clearSearch() {
    this.setData({ query: '' });
    this.refresh();
  },

  toggleTag(event: any) {
    const id = event.detail.id;
    const selected = [...this.data.selectedTagIds];
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    this.setData({ selectedTagIds: selected });
    this.refresh();
  },

  clearFilters() {
    this.setData({ query: '', selectedTagIds: [] });
    this.refresh();
  },

  showAll() {
    this.setData({ selectedTagIds: [], favoritesOnly: false });
    this.refresh();
  },

  manageTags() {
    wx.navigateTo({ url: '/pages/tags/tags' });
  },

  openPrompt(event: any) {
    wx.navigateTo({ url: `/pages/prompt-detail/prompt-detail?id=${event.detail.id}` });
  },

  copyPrompt(event: any) {
    copyText(event.detail.content, settingsService.get().showCopyToast);
  },

  dismissCopyHint() {
    this.setData({ showCopyHint: false });
    wx.setStorageSync('pdou_copy_hint_v1', true);
  },

  toggleFavorite(event: any) {
    promptService.toggleFavorite(event.detail.id);
    this.refresh();
  },

  createPrompt() {
    wx.navigateTo({ url: '/pages/prompt-editor/prompt-editor' });
  },

  changeListMode(event: any) {
    this.setData({ favoritesOnly: event.currentTarget.dataset.mode === 'favorite' });
    this.refresh();
  },

  showPendingUndo() {
    const pending = deleteUndoService.get();
    if (!pending) {
      this.setData({ showUndo: false, undoPreview: '' });
      return;
    }

    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.setData({ showUndo: true, undoPreview: pending.preview });
    this.undoTimer = setTimeout(() => {
      deleteUndoService.clear(pending.id);
      this.setData({ showUndo: false, undoPreview: '' });
    }, Math.max(0, pending.expiresAt - Date.now()));
  },

  undoDelete() {
    const pending = deleteUndoService.get();
    if (!pending || !promptService.restore(pending.id)) return;
    deleteUndoService.clear(pending.id);
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.setData({ showUndo: false, undoPreview: '' });
    this.refresh();
    wx.showToast({ title: '已恢复', icon: 'success' });
  }
});
