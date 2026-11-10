import { LocalBackup, LocalSyncMeta, Prompt, Tag, UserSettings } from '../models/index';
import { createId } from '../utils/id';

const KEYS = {
  prompts: 'mp_prompts_v1',
  tags: 'mp_tags_v1',
  settings: 'mp_settings_v1',
  syncMeta: 'mp_sync_meta_v1',
  backups: 'mp_backups_v1'
};

const changeListeners: Array<() => void> = [];
function notifyChange(): void {
  changeListeners.forEach(listener => listener());
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = wx.getStorageSync(key);
    return value === '' || value === undefined || value === null ? fallback : value as T;
  } catch (error) {
    console.error(`读取本地数据失败：${key}`, error);
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  wx.setStorageSync(key, value);
}

function defaultSettings(): UserSettings {
  return {
    id: 'settings',
    theme: 'system',
    showCopyToast: true,
    defaultList: 'all',
    recycleRetentionDays: 30,
    cloudSyncEnabled: false,
    updatedAt: Date.now()
  };
}

function defaultSyncMeta(): LocalSyncMeta {
  return {
    deviceId: createId('device'),
    lastSyncAt: null,
    promptStates: {},
    tagStates: {}
  };
}

export const localRepository = {
  subscribeChanges(listener: () => void): () => void {
    changeListeners.push(listener);
    return () => {
      const index = changeListeners.indexOf(listener);
      if (index >= 0) changeListeners.splice(index, 1);
    };
  },
  getPrompts(): Prompt[] {
    return read<Prompt[]>(KEYS.prompts, []);
  },

  savePrompts(prompts: Prompt[]): void {
    write(KEYS.prompts, prompts);
  },

  getPrompt(id: string): Prompt | undefined {
    return this.getPrompts().find(item => item.id === id);
  },

  upsertPrompt(prompt: Prompt): void {
    const prompts = this.getPrompts();
    const index = prompts.findIndex(item => item.id === prompt.id);
    if (index >= 0) prompts[index] = prompt;
    else prompts.unshift(prompt);
    this.savePrompts(prompts);
  },

  removePrompt(id: string): void {
    this.savePrompts(this.getPrompts().filter(item => item.id !== id));
    const meta = this.getSyncMeta();
    delete meta.promptStates[id];
    this.saveSyncMeta(meta);
  },

  getTags(): Tag[] {
    return read<Tag[]>(KEYS.tags, []);
  },

  saveTags(tags: Tag[]): void {
    write(KEYS.tags, tags);
  },

  getTag(id: string): Tag | undefined {
    return this.getTags().find(item => item.id === id);
  },

  upsertTag(tag: Tag): void {
    const tags = this.getTags();
    const index = tags.findIndex(item => item.id === tag.id);
    if (index >= 0) tags[index] = tag;
    else tags.push(tag);
    this.saveTags(tags);
  },

  getSettings(): UserSettings {
    return read<UserSettings>(KEYS.settings, defaultSettings());
  },

  saveSettings(settings: UserSettings): void {
    write(KEYS.settings, settings);
  },

  getSyncMeta(): LocalSyncMeta {
    const existing = read<LocalSyncMeta | null>(KEYS.syncMeta, null);
    if (existing) return existing;
    const created = defaultSyncMeta();
    write(KEYS.syncMeta, created);
    return created;
  },

  saveSyncMeta(meta: LocalSyncMeta): void {
    write(KEYS.syncMeta, meta);
    notifyChange();
  },

  getBackups(): LocalBackup[] {
    return read<LocalBackup[]>(KEYS.backups, []);
  },

  createBackup(reason: string): LocalBackup {
    const backup: LocalBackup = {
      id: createId('backup'),
      reason,
      createdAt: Date.now(),
      prompts: this.getPrompts(),
      tags: this.getTags(),
      settings: this.getSettings()
    };
    write(KEYS.backups, [backup, ...this.getBackups()].slice(0, 3));
    return backup;
  },

  restoreBackup(id: string): boolean {
    const backup = this.getBackups().find(item => item.id === id);
    if (!backup) return false;
    const currentSettings = this.getSettings();
    this.savePrompts(backup.prompts);
    this.saveTags(backup.tags);
    this.saveSettings({
      ...backup.settings,
      cloudSyncEnabled: currentSettings.cloudSyncEnabled,
      updatedAt: Date.now()
    });

    const meta = this.getSyncMeta();
    meta.promptStates = {};
    meta.tagStates = {};
    backup.prompts.forEach(prompt => {
      meta.promptStates[prompt.id] = {
        dirty: true,
        baseCloudVersion: prompt.cloudVersion,
        lastCloudUpdatedAt: prompt.cloudVersion > 0 ? prompt.updatedAt : null
      };
    });
    backup.tags.forEach(tag => {
      meta.tagStates[tag.id] = {
        dirty: true,
        baseCloudVersion: tag.cloudVersion,
        lastCloudUpdatedAt: tag.cloudVersion > 0 ? tag.updatedAt : null
      };
    });
    this.saveSyncMeta(meta);
    return true;
  },

  removeBackup(id: string): void {
    write(KEYS.backups, this.getBackups().filter(item => item.id !== id));
  },

  clearAllData(): void {
    Object.values(KEYS).forEach(key => wx.removeStorageSync(key));
  },

  markPromptDirty(prompt: Prompt): void {
    const meta = this.getSyncMeta();
    const previous = meta.promptStates[prompt.id];
    meta.promptStates[prompt.id] = {
      dirty: true,
      baseCloudVersion: previous?.baseCloudVersion ?? prompt.cloudVersion,
      lastCloudUpdatedAt: previous?.lastCloudUpdatedAt ?? null
    };
    this.saveSyncMeta(meta);
  },

  markTagDirty(tag: Tag): void {
    const meta = this.getSyncMeta();
    const previous = meta.tagStates[tag.id];
    meta.tagStates[tag.id] = {
      dirty: true,
      baseCloudVersion: previous?.baseCloudVersion ?? tag.cloudVersion,
      lastCloudUpdatedAt: previous?.lastCloudUpdatedAt ?? null
    };
    this.saveSyncMeta(meta);
  }
};
