import { Prompt } from '../../models/index';
import { localRepository } from '../../repositories/local-repository';
import { promptService } from '../../services/prompt-service';
import { tagService } from '../../services/tag-service';
import { formatDateTime } from '../../utils/date';

interface RecycledPromptView extends Prompt {
  tagNames: string[];
  deletedLabel: string;
}

Page({
  data: {
    prompts: [] as RecycledPromptView[],
    retentionDays: 30
  },

  onShow() {
    const settings = localRepository.getSettings();
    promptService.purgeExpired(settings.recycleRetentionDays);
    this.setData({ retentionDays: settings.recycleRetentionDays });
    this.refresh();
  },

  refresh() {
    const tagMap = new Map(tagService.listActive().map(tag => [tag.id, tag.name]));
    const prompts = promptService.listDeleted().map(prompt => ({
      ...prompt,
      tagNames: prompt.tagIds.map(id => tagMap.get(id)).filter(Boolean) as string[],
      deletedLabel: prompt.deletedAt ? formatDateTime(prompt.deletedAt) : '删除时间未知'
    }));
    this.setData({ prompts });
  },

  restorePrompt(event: any) {
    const id = event.currentTarget.dataset.id;
    if (!promptService.restore(id)) return;
    this.refresh();
    wx.showToast({ title: '已恢复', icon: 'success' });
  },

  deleteForever(event: any) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: '彻底删除提示词？',
      content: '彻底删除后无法恢复。',
      confirmText: '彻底删除',
      confirmColor: '#A13D42',
      success: async (result: any) => {
        if (!result.confirm) return;
        let removed = false;
        try { removed = await promptService.hardDelete(id); }
        catch (error) {
          console.error('彻底删除失败', error);
          wx.showToast({ title: '暂未删除，请联网后重试', icon: 'none' });
          return;
        }
        if (!removed) {
          wx.showToast({ title: '等待删除状态自动同步后重试', icon: 'none' });
          return;
        }
        this.refresh();
        wx.showToast({ title: '已彻底删除', icon: 'none' });
      }
    });
  },

  clearRecycleBin() {
    if (!this.data.prompts.length) return;
    wx.showModal({
      title: '清空回收站？',
      content: `将彻底删除 ${this.data.prompts.length} 条提示词，此操作无法撤销。`,
      confirmText: '清空',
      confirmColor: '#A13D42',
      success: async (result: any) => {
        if (!result.confirm) return;
        let removed = 0;
        for (const prompt of this.data.prompts as RecycledPromptView[]) {
          try { if (await promptService.hardDelete(prompt.id)) removed += 1; }
          catch (error) { console.error('清空回收站中断', error); break; }
        }
        this.refresh();
        wx.showToast({ title: removed ? `已删除 ${removed} 条` : '暂未删除，请稍后重试', icon: 'none' });
      }
    });
  }
});
