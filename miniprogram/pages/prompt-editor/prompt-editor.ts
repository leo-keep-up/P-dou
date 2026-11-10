import { Tag } from '../../models/index';
import { promptService } from '../../services/prompt-service';
import { tagService } from '../../services/tag-service';
import { autoSyncService } from '../../services/auto-sync-service';

interface EditorTag extends Tag {
  selected: boolean;
}

Page({
  saveTimer: 0 as any,
  isSaving: false,
  draftContent: '',
  promptId: '',
  lastSavedSignature: '',

  data: {
    id: '',
    content: '',
    selectedTagIds: [] as string[],
    tags: [] as EditorTag[],
    isFavorite: false,
    isEditing: false,
    shouldAutoFocus: false,
    saveStatus: '输入后将自动保存',
    tagName: '',
    syncStatus: ''
  },

  onLoad(options: Record<string, string>) {
    const id = options.id || '';
    const existing = id ? promptService.get(id) : undefined;
    this.promptId = existing?.id ?? '';
    this.draftContent = existing?.content ?? '';
    this.lastSavedSignature = existing
      ? this.buildSignature(existing.content, existing.tagIds, existing.isFavorite)
      : '';
    this.setData({
      id,
      content: existing?.content ?? '',
      selectedTagIds: existing?.tagIds ?? [],
      isFavorite: existing?.isFavorite ?? false,
      isEditing: Boolean(existing),
      shouldAutoFocus: !existing,
      saveStatus: existing ? '已保存到本地' : '输入后将自动保存'
    });
    wx.setNavigationBarTitle({ title: existing ? '编辑提示词' : '新增提示词' });
    this.loadTags();
  },

  onShow() {
    autoSyncService.setEditing(true);
    this.unsubscribeSync = autoSyncService.subscribe(() => {
      this.setData({ syncStatus: autoSyncService.getState().status });
    });
  },

  onUnload() {
    if (this.unsubscribeSync) this.unsubscribeSync();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveNow(false);
    autoSyncService.setEditing(false);
  },

  onHide() {
    if (this.unsubscribeSync) this.unsubscribeSync();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveNow(false);
    // Backgrounding is not leaving the editor. Keep the draft protected until unload.
  },

  loadTags() {
    const selected = this.data.selectedTagIds;
    this.setData({
      tags: tagService.listActive().map(tag => ({ ...tag, selected: selected.includes(tag.id) }))
    });
  },

  handleInput(event: any) {
    // 正文保留在页面草稿中，不通过 setData 回写 textarea，避免干扰中文输入法。
    this.draftContent = event.detail.value;
    if (this.data.saveStatus !== '正在输入…') this.setData({ saveStatus: '正在输入…' });
    this.scheduleSave();
  },

  handleBlur(event: any) {
    this.draftContent = event.detail.value;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveNow();
  },

  toggleTag(event: any) {
    const id = event.detail.id;
    const selected = [...this.data.selectedTagIds];
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    this.setData({ selectedTagIds: selected, saveStatus: '等待保存…' });
    this.loadTags();
    this.scheduleSave();
  },

  handleTagName(event: any) {
    this.setData({ tagName: event.detail.value });
  },

  addTag() {
    const result = tagService.create(this.data.tagName);
    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' });
      return;
    }
    const id = result.tag!.id;
    this.setData({ tagName: '', selectedTagIds: [...this.data.selectedTagIds, id] });
    this.loadTags();
    this.scheduleSave();
  },

  toggleFavorite() {
    this.setData({ isFavorite: !this.data.isFavorite, saveStatus: '等待保存…' });
    this.scheduleSave();
  },

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 5000);
  },

  buildSignature(content: string, tagIds: string[], isFavorite: boolean) {
    return JSON.stringify([content, [...tagIds].sort(), isFavorite]);
  },

  saveNow(updateStatus = true) {
    const content = this.draftContent;
    if (this.isSaving || !content.trim()) {
      if (updateStatus && !content.trim()) this.setData({ saveStatus: '正文为空，不会创建记录' });
      return;
    }

    const signature = this.buildSignature(content, this.data.selectedTagIds, this.data.isFavorite);
    if (signature === this.lastSavedSignature) {
      if (updateStatus) this.setData({ saveStatus: '已保存到本地' });
      return;
    }

    this.isSaving = true;
    if (updateStatus) this.setData({ saveStatus: '保存中…' });
    try {
      const saved = promptService.save({
        id: this.promptId || undefined,
        content,
        tagIds: this.data.selectedTagIds,
        isFavorite: this.data.isFavorite
      });
      if (saved) {
        this.promptId = saved.id;
        this.lastSavedSignature = signature;
        if (updateStatus) {
          this.setData({ id: saved.id, isEditing: true, saveStatus: '已保存到本地' });
          wx.setNavigationBarTitle({ title: '编辑提示词' });
        }
      }
    } catch (error) {
      console.error('保存提示词失败', error);
      if (updateStatus) this.setData({ saveStatus: '保存失败，请重试' });
    } finally {
      this.isSaving = false;
    }
  }
});
