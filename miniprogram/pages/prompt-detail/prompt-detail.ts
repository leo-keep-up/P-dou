import { Prompt, Tag } from '../../models/index';
import { deleteUndoService } from '../../services/delete-undo-service';
import { promptService } from '../../services/prompt-service';
import { tagService } from '../../services/tag-service';
import { formatDateTime } from '../../utils/date';

Page({
  data: {
    id: '',
    prompt: null as Prompt | null,
    tags: [] as Tag[],
    updatedLabel: ''
  },

  onLoad(options: Record<string, string>) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    this.loadPrompt();
  },

  loadPrompt() {
    const prompt = promptService.get(this.data.id);
    if (!prompt || prompt.isDeleted) {
      wx.showToast({ title: '提示词不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    const tagIds = prompt.tagIds;
    const tags = tagService.listActive().filter(tag => tagIds.includes(tag.id));
    this.setData({ prompt, tags, updatedLabel: formatDateTime(prompt.updatedAt) });
  },

  editPrompt() {
    wx.navigateTo({ url: `/pages/prompt-editor/prompt-editor?id=${this.data.id}` });
  },

  toggleFavorite() {
    promptService.toggleFavorite(this.data.id);
    this.loadPrompt();
  },

  deletePrompt() {
    const content = this.data.prompt?.content ?? '';
    if (!promptService.softDelete(this.data.id)) return;
    deleteUndoService.offer(this.data.id, content);
    wx.navigateBack();
  }
});
