export function copyText(content: string, showToast = true): void {
  wx.setClipboardData({
    data: content,
    success: () => {
      if (showToast) wx.showToast({ title: '已复制', icon: 'success' });
    },
    fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
  });
}
