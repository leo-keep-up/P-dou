import { localRepository } from '../repositories/local-repository';
import { formatDateTime } from '../utils/date';

export type ExportFormat = 'json' | 'markdown';

export interface ExportArtifact {
  format: ExportFormat;
  fileName: string;
  filePath: string;
  content: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function exportStamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function createJsonContent(): string {
  const payload = {
    formatVersion: 1,
    appName: '我的提词器',
    exportedAt: new Date().toISOString(),
    prompts: localRepository.getPrompts(),
    tags: localRepository.getTags(),
    settings: localRepository.getSettings(),
    syncBackups: localRepository.getBackups()
  };
  return JSON.stringify(payload, null, 2);
}

function createMarkdownContent(): string {
  const tags = localRepository.getTags();
  const tagMap = new Map(tags.map(tag => [tag.id, tag.name]));
  const prompts = localRepository.getPrompts()
    .filter(prompt => !prompt.isDeleted)
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return Number(b.isFavorite) - Number(a.isFavorite);
      return b.updatedAt - a.updatedAt;
    });

  const lines = [
    '# 我的提词器',
    '',
    `导出时间：${formatDateTime(Date.now())}`,
    `提示词数量：${prompts.length}`,
    '',
    '---',
    ''
  ];

  prompts.forEach((prompt, index) => {
    const tagNames = prompt.tagIds.map(id => tagMap.get(id)).filter(Boolean) as string[];
    lines.push(
      `## 提示词 ${index + 1}${prompt.isFavorite ? ' ★' : ''}`,
      '',
      prompt.content,
      '',
      `标签：${tagNames.length ? tagNames.map(name => `#${name}`).join('、') : '无'}`,
      `最后修改：${formatDateTime(prompt.updatedAt)}`,
      '',
      '---',
      ''
    );
  });

  return lines.join('\n');
}

export const exportService = {
  create(format: ExportFormat): ExportArtifact {
    const now = new Date();
    const extension = format === 'json' ? 'json' : 'md';
    const fileName = `我的提词器-${exportStamp(now)}.${extension}`;
    const content = format === 'json' ? createJsonContent() : createMarkdownContent();
    return {
      format,
      fileName,
      filePath: `${wx.env.USER_DATA_PATH}/${fileName}`,
      content
    };
  },

  write(format: ExportFormat): ExportArtifact {
    const artifact = this.create(format);
    wx.getFileSystemManager().writeFileSync(artifact.filePath, artifact.content, 'utf8');
    return artifact;
  },

  share(artifact: ExportArtifact): Promise<void> {
    if (typeof wx.shareFileMessage !== 'function') {
      return Promise.reject(new Error('当前环境不支持文件分享'));
    }
    return new Promise((resolve, reject) => {
      wx.shareFileMessage({
        filePath: artifact.filePath,
        fileName: artifact.fileName,
        success: resolve,
        fail: reject
      });
    });
  }
};
