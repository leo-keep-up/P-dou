import { cloudConfig, isCloudConfigured } from './config/cloud';
import { autoSyncService } from './services/auto-sync-service';

const REMOVED_FEATURE_STORAGE_KEY = 'mp_feedback_outbox_v1';

App({
  globalData: {
    cloudReady: false
  },

  onLaunch() {
    // 清除旧版本曾保存在本机的待发送内容，避免功能移除后继续残留用户数据。
    wx.removeStorageSync(REMOVED_FEATURE_STORAGE_KEY);
    if (!isCloudConfigured()) return;
    wx.cloud.init({
      env: cloudConfig.envId,
      traceUser: true
    });
    this.globalData.cloudReady = true;
    autoSyncService.init();
  },
  onShow() { autoSyncService.foreground(); },
  onHide() { autoSyncService.background(); }
});
