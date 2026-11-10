import { settingsService } from '../../services/settings-service';
import { appStore } from '../../store/app-store';

Page({
  data: {
    showCopyToast: true,
    defaultList: 'all',
    recycleRetentionDays: 30,
    promptCount: 0,
    tagCount: 0,
    storageSizeLabel: '0 KB',
    retentionOptions: [7, 30, 90]
  },

  onShow() {
    this.loadSettings();
  },

  loadSettings() {
    const settings = settingsService.get();
    const state = appStore.refresh();
    const serialized = JSON.stringify({ prompts: state.prompts, tags: state.tags, settings });
    const approximateKb = Math.max(1, Math.ceil(serialized.length * 1.5 / 1024));
    this.setData({
      showCopyToast: settings.showCopyToast,
      defaultList: settings.defaultList,
      recycleRetentionDays: settings.recycleRetentionDays,
      promptCount: state.prompts.length,
      tagCount: state.tags.length,
      storageSizeLabel: `${approximateKb} KB`
    });
  },

  toggleCopyToast(event: any) {
    const showCopyToast = event.detail.value;
    settingsService.update({ showCopyToast });
    this.setData({ showCopyToast });
  },

  changeDefaultList(event: any) {
    const defaultList = event.currentTarget.dataset.value;
    settingsService.update({ defaultList });
    this.setData({ defaultList });
  },

  changeRetention(event: any) {
    const recycleRetentionDays = Number(event.currentTarget.dataset.value);
    settingsService.update({ recycleRetentionDays });
    this.setData({ recycleRetentionDays });
  },

  openBackups() {
    wx.navigateTo({ url: '/pages/backups/backups' });
  },

  clearLocalData() {
    wx.showModal({
      title: '清除全部本机数据？',
      content: '提示词、标签、回收站和本机设置都会被删除，且无法恢复。云端数据不会受到影响。',
      confirmText: '确认清除',
      confirmColor: '#A13D42',
      success: (result: any) => {
        if (!result.confirm) return;
        settingsService.clearLocalData();
        this.loadSettings();
        wx.showToast({ title: '本机数据已清除', icon: 'none' });
      }
    });
  }
});
