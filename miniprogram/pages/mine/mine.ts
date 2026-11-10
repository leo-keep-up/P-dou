import { appStore } from '../../store/app-store';
import { syncService, SyncResult } from '../../services/sync-service';
import { formatDateTime } from '../../utils/date';
import { autoSyncService } from '../../services/auto-sync-service';

Page({
  data: {
    promptCount: 0,
    tagCount: 0,
    favoriteCount: 0,
    recycleCount: 0,
    cloudConfigured: false,
    cloudSyncEnabled: false,
    syncing: false,
    syncStatus: '',
    lastSyncLabel: '尚未同步',
    menuGroups: [
      [
        { key: 'manage', symbol: '☷', title: '提示词管理', desc: '批量整理提示词' },
        { key: 'recycle', symbol: '↺', title: '回收站', desc: '恢复或彻底删除' },
        { key: 'export', symbol: '⇩', title: '数据导出', desc: '导出 JSON 或 Markdown' }
      ],
      [
        { key: 'settings', symbol: '⚙', title: '设置', desc: '显示与使用偏好' }
      ]
    ]
  },

  onShow() {
    if (this.unsubscribeSync) this.unsubscribeSync();
    this.unsubscribeSync = autoSyncService.subscribe(() => this.refreshStatus());
    this.refreshStatus();
  },

  onHide() { if (this.unsubscribeSync) this.unsubscribeSync(); },
  onUnload() { if (this.unsubscribeSync) this.unsubscribeSync(); },

  refreshStatus() {
    const state = appStore.refresh();
    const cloudStatus = syncService.getStatus();
    const activePrompts = state.prompts.filter(prompt => !prompt.isDeleted);
    const recycleCount = state.prompts.filter(prompt => prompt.isDeleted && !prompt.isPurged).length;
    this.setData({
      promptCount: activePrompts.length,
      tagCount: state.tags.filter(tag => !tag.isDeleted).length,
      favoriteCount: activePrompts.filter(prompt => prompt.isFavorite).length,
      recycleCount,
      cloudConfigured: cloudStatus.configured,
      cloudSyncEnabled: cloudStatus.enabled,
      syncing: autoSyncService.getState().syncing,
      syncStatus: autoSyncService.getState().status,
      lastSyncLabel: cloudStatus.lastSyncAt ? `上次同步 ${formatDateTime(cloudStatus.lastSyncAt)}` : '尚未同步'
    });
  },

  openCloudSetup() {
    if (this.data.syncing) return;
    if (!this.data.cloudConfigured) {
      wx.showModal({
        title: '还差一个环境 ID',
        content: '正式 AppID 已经写入项目。请先在微信开发者工具中创建云开发环境，再把环境 ID 填入 miniprogram/config/cloud.ts。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    if (this.data.cloudSyncEnabled) {
      return;
    }

    wx.showModal({
      title: '开启微信云同步？',
      content: '将先保存本机备份。如果云端已有数据，会以云端数据为准；如果云端为空，则上传当前本机数据。',
      confirmText: '开启同步',
      success: (result: any) => {
        if (result.confirm) this.enableCloudSync();
      }
    });
  },

  async enableCloudSync() {
    this.setData({ syncing: true, syncStatus: '正在开启自动同步…' });
    wx.showLoading({ title: '同步中…', mask: true });
    try {
      const result: SyncResult = await syncService.enable();
      const summary = [
        result.uploaded ? `上传 ${result.uploaded} 条` : '',
        result.downloaded ? `下载 ${result.downloaded} 条` : '',
        result.conflicts ? `处理 ${result.conflicts} 个冲突` : ''
      ].filter(Boolean).join('，') || '数据已是最新';
      this.setData({ syncStatus: summary });
      this.onShow();
      wx.hideLoading();
      wx.showModal({
        title: '自动同步已开启',
        content: summary,
        showCancel: false,
        confirmText: '完成'
      });
    } catch (error: any) {
      console.error('云同步失败', error);
      this.setData({ syncStatus: '同步失败，本机数据未清空' });
      wx.hideLoading();
      wx.showModal({
        title: '同步失败',
        content: error?.errMsg || error?.message || '请检查网络、云环境和数据库权限后重试。',
        showCancel: false,
        confirmText: '知道了'
      });
    } finally {
      wx.hideLoading();
      this.setData({ syncing: false });
      autoSyncService.request();
    }
  },

  handleMenu(event: any) {
    const key = event.currentTarget.dataset.key;
    if (key === 'manage') {
      wx.navigateTo({ url: '/pages/prompt-manager/prompt-manager' });
      return;
    }
    if (key === 'recycle') {
      wx.navigateTo({ url: '/pages/recycle-bin/recycle-bin' });
      return;
    }
    if (key === 'export') {
      wx.navigateTo({ url: '/pages/export/export' });
      return;
    }
    if (key === 'settings') {
      wx.navigateTo({ url: '/pages/settings/settings' });
      return;
    }
    wx.showToast({ title: '功能建设中', icon: 'none', duration: 1800 });
  }
});
