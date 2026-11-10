import { Tag } from '../../models/index';
import { promptService } from '../../services/prompt-service';
import { tagService } from '../../services/tag-service';

interface TagRow extends Tag {
  count: number;
}

Page({
  data: {
    tagName: '',
    query: '',
    tags: [] as TagRow[]
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const query = this.data.query.trim().toLocaleLowerCase();
    const prompts = promptService.listAll().filter(prompt => !prompt.isDeleted);
    const tags = tagService.listActive()
      .filter(tag => !query || tag.name.toLocaleLowerCase().includes(query))
      .map(tag => ({ ...tag, count: prompts.filter(prompt => prompt.tagIds.includes(tag.id)).length }));
    this.setData({ tags });
  },

  handleName(event: any) {
    this.setData({ tagName: event.detail.value });
  },

  addTag() {
    const result = tagService.create(this.data.tagName);
    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' });
      return;
    }
    this.setData({ tagName: '' });
    this.refresh();
  },

  handleSearch(event: any) {
    this.setData({ query: event.detail.value });
    this.refresh();
  },

  openTag(event: any) {
    const id = event.currentTarget.dataset.id;
    wx.reLaunch({ url: `/pages/home/home?tagId=${id}` });
  },

  renameTag(event: any) {
    const id = event.currentTarget.dataset.id;
    const tag = tagService.listActive().find(item => item.id === id);
    if (!tag) return;
    wx.showModal({
      title: '重命名标签',
      editable: true,
      placeholderText: tag.name,
      content: tag.name,
      success: (result: any) => {
        if (!result.confirm) return;
        const renamed = tagService.rename(id, result.content);
        if (renamed.error) wx.showToast({ title: renamed.error, icon: 'none' });
        this.refresh();
      }
    });
  },

  deleteTag(event: any) {
    const id = event.currentTarget.dataset.id;
    tagService.softDelete(id);
    wx.showToast({ title: '标签已删除', icon: 'none' });
    this.refresh();
  }
});
