import { ExportArtifact, ExportFormat, exportService } from '../../services/export-service';
import { appStore } from '../../store/app-store';

Page({
  data: {
    promptCount: 0,
    deletedCount: 0,
    tagCount: 0,
    busyFormat: '',
    lastExportName: ''
  },

  onShow() {
    const state = appStore.refresh();
    this.setData({
      promptCount: state.prompts.filter(prompt => !prompt.isDeleted).length,
      deletedCount: state.prompts.filter(prompt => prompt.isDeleted).length,
      tagCount: state.tags.filter(tag => !tag.isDeleted).length
    });
  },

  copyContent(content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      wx.setClipboardData({ data: content, success: resolve, fail: reject });
    });
  },

  async exportFile(event: any) {
    if (this.data.busyFormat) return;
    const format = event.currentTarget.dataset.format as ExportFormat;
    this.setData({ busyFormat: format });
    wx.showLoading({ title: '正在生成…', mask: true });

    let artifact: ExportArtifact;
    try {
      artifact = exportService.write(format);
      this.setData({ lastExportName: artifact.fileName });
      wx.hideLoading();

      try {
        await exportService.share(artifact);
        wx.showToast({ title: '文件已生成', icon: 'success' });
      } catch (error: any) {
        if ((error?.errMsg || error?.message || '').includes('cancel')) return;
        await this.copyContent(artifact.content);
        wx.showModal({
          title: '文件已生成',
          content: '当前预览环境无法调起文件分享，导出内容已复制到剪贴板。请在手机微信中预览后再次尝试分享文件。',
          showCancel: false,
          confirmText: '知道了'
        });
      }
    } catch (error) {
      console.error('导出文件失败', error);
      wx.showToast({ title: '导出失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ busyFormat: '' });
    }
  },

  async copyExport(event: any) {
    const format = event.currentTarget.dataset.format as ExportFormat;
    try {
      const artifact = exportService.create(format);
      await this.copyContent(artifact.content);
    } catch (error) {
      console.error('复制导出内容失败', error);
      wx.showToast({ title: '复制失败，请重试', icon: 'none' });
    }
  }
});
