export const cloudConfig = {
  // 在微信开发者工具“云开发”控制台中复制环境 ID，并填写到这里。
  // 留空时应用保持纯本地模式，不会调用任何云端 API。
  envId: ''
};

export function isCloudConfigured(): boolean {
  return Boolean(cloudConfig.envId.trim()) && Boolean(wx.cloud);
}
