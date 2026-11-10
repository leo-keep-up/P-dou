import { LocalBackup } from '../../models/index';
import { backupService } from '../../services/backup-service';
import { formatDateTime } from '../../utils/date';

interface BackupView extends LocalBackup {
  createdLabel: string;
  activePromptCount: number;
  deletedPromptCount: number;
  tagCount: number;
}

Page({
  data: {
    backups: [] as BackupView[]
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const backups = backupService.list().map(backup => ({
      ...backup,
      createdLabel: formatDateTime(backup.createdAt),
      activePromptCount: backup.prompts.filter(prompt => !prompt.isDeleted).length,
      deletedPromptCount: backup.prompts.filter(prompt => prompt.isDeleted).length,
      tagCount: backup.tags.filter(tag => !tag.isDeleted).length
    }));
    this.setData({ backups });
  },

  restoreBackup(event: any) {
    const id = event.currentTarget.dataset.id;
    const backup = this.data.backups.find((item: BackupView) => item.id === id);
    if (!backup) return;
    wx.showModal({
      title: '恢复这份备份？',
      content: `将用 ${backup.createdLabel} 的数据替换当前本机提示词和标签。恢复后的记录会标记为待同步。`,
      confirmText: '确认恢复',
      success: (result: any) => {
        if (!result.confirm) return;
        if (!backupService.restore(id)) {
          wx.showToast({ title: '备份不存在', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '备份已恢复',
          content: '当前本机数据已经替换。返回首页即可查看；下次云同步仍会执行版本冲突检查。',
          showCancel: false,
          confirmText: '完成'
        });
      }
    });
  },

  removeBackup(event: any) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这份备份？',
      content: '删除后无法从本机恢复这份快照。',
      confirmText: '删除',
      confirmColor: '#A13D42',
      success: (result: any) => {
        if (!result.confirm) return;
        backupService.remove(id);
        this.refresh();
        wx.showToast({ title: '备份已删除', icon: 'none' });
      }
    });
  }
});
