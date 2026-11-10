import { PromptView, Tag } from '../../models/index';
import { promptService } from '../../services/prompt-service';
import { buildPromptViews } from '../../services/search-service';
import { appStore } from '../../store/app-store';

interface ManagerPrompt extends PromptView {
  selected: boolean;
}

interface ManagerTag extends Tag {
  selected: boolean;
}

Page({
  data: {
    query: '',
    prompts: [] as ManagerPrompt[],
    selectedIds: [] as string[],
    selectedCount: 0,
    allVisibleSelected: false,
    favoriteActionLabel: '收藏',
    tags: [] as ManagerTag[],
    selectedTagIds: [] as string[],
    showTagSheet: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const state = appStore.refresh();
    const activeTags = state.tags.filter(tag => !tag.isDeleted);
    const activeIds = new Set(state.prompts.filter(prompt => !prompt.isDeleted).map(prompt => prompt.id));
    const selectedIds = this.data.selectedIds.filter((id: string) => activeIds.has(id));
    const selectedSet = new Set(selectedIds);
    const views = buildPromptViews(state.prompts, activeTags, {
      query: this.data.query,
      selectedTagIds: []
    });
    const prompts = views.map(prompt => ({ ...prompt, selected: selectedSet.has(prompt.id) }));
    const selectedPrompts = state.prompts.filter(prompt => selectedSet.has(prompt.id));
    const allSelectedFavorite = selectedPrompts.length > 0 && selectedPrompts.every(prompt => prompt.isFavorite);

    this.setData({
      prompts,
      selectedIds,
      selectedCount: selectedIds.length,
      allVisibleSelected: prompts.length > 0 && prompts.every(prompt => prompt.selected),
      favoriteActionLabel: allSelectedFavorite ? '取消收藏' : '收藏',
      tags: activeTags.map(tag => ({ ...tag, selected: this.data.selectedTagIds.includes(tag.id) }))
    });
  },

  handleSearch(event: any) {
    this.setData({ query: event.detail.value, selectedIds: [] });
    this.refresh();
  },

  clearSearch() {
    this.setData({ query: '', selectedIds: [] });
    this.refresh();
  },

  togglePrompt(event: any) {
    const id = event.currentTarget.dataset.id;
    const selectedIds = [...this.data.selectedIds];
    const index = selectedIds.indexOf(id);
    if (index >= 0) selectedIds.splice(index, 1);
    else selectedIds.push(id);
    this.setData({ selectedIds });
    this.refresh();
  },

  toggleSelectAll() {
    const visibleIds = this.data.prompts.map((prompt: ManagerPrompt) => prompt.id);
    if (this.data.allVisibleSelected) {
      const visibleSet = new Set(visibleIds);
      this.setData({ selectedIds: this.data.selectedIds.filter((id: string) => !visibleSet.has(id)) });
    } else {
      this.setData({ selectedIds: Array.from(new Set([...this.data.selectedIds, ...visibleIds])) });
    }
    this.refresh();
  },

  clearSelection() {
    this.setData({ selectedIds: [] });
    this.refresh();
  },

  batchFavorite() {
    const shouldFavorite = this.data.favoriteActionLabel === '收藏';
    promptService.batchSetFavorite(this.data.selectedIds, shouldFavorite);
    this.refresh();
    wx.showToast({ title: shouldFavorite ? '已收藏' : '已取消收藏', icon: 'success' });
  },

  openTagSheet() {
    if (!this.data.tags.length) {
      wx.showToast({ title: '请先创建标签', icon: 'none' });
      return;
    }
    this.setData({ showTagSheet: true, selectedTagIds: [] });
    this.refresh();
  },

  closeTagSheet() {
    this.setData({ showTagSheet: false, selectedTagIds: [] });
    this.refresh();
  },

  swallow() {},

  toggleBatchTag(event: any) {
    const id = event.currentTarget.dataset.id;
    const selectedTagIds = [...this.data.selectedTagIds];
    const index = selectedTagIds.indexOf(id);
    if (index >= 0) selectedTagIds.splice(index, 1);
    else selectedTagIds.push(id);
    this.setData({ selectedTagIds });
    this.refresh();
  },

  applyBatchTags(event: any) {
    if (!this.data.selectedTagIds.length) {
      wx.showToast({ title: '请选择标签', icon: 'none' });
      return;
    }
    const mode = event.currentTarget.dataset.mode;
    const count = mode === 'remove'
      ? promptService.batchRemoveTags(this.data.selectedIds, this.data.selectedTagIds)
      : promptService.batchAddTags(this.data.selectedIds, this.data.selectedTagIds);
    this.setData({ showTagSheet: false, selectedTagIds: [] });
    this.refresh();
    wx.showToast({ title: count ? `已更新 ${count} 条` : '无需修改', icon: 'none' });
  },

  batchDelete() {
    const count = promptService.batchSoftDelete(this.data.selectedIds);
    this.setData({ selectedIds: [] });
    this.refresh();
    wx.showToast({ title: count ? `已删除 ${count} 条` : '没有可删除内容', icon: 'none' });
  }
});
