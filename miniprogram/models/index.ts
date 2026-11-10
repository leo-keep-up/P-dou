export interface Prompt {
  isPurged?: boolean;
  conflictOf?: string;
  id: string;
  content: string;
  tagIds: string[];
  isFavorite: boolean;
  isDeleted: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  cloudVersion: number;
}

export interface Tag {
  id: string;
  name: string;
  normalizedName: string;
  isDeleted: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  cloudVersion: number;
}

export interface UserSettings {
  id: string;
  theme: 'system' | 'light' | 'dark';
  showCopyToast: boolean;
  defaultList: 'all' | 'favorite';
  recycleRetentionDays: number;
  cloudSyncEnabled: boolean;
  updatedAt: number;
}

export interface SyncItemState {
  dirty: boolean;
  baseCloudVersion: number;
  lastCloudUpdatedAt: number | null;
}

export interface LocalSyncMeta {
  deviceId: string;
  lastSyncAt: number | null;
  promptStates: Record<string, SyncItemState>;
  tagStates: Record<string, SyncItemState>;
}

export interface LocalBackup {
  id: string;
  reason: string;
  createdAt: number;
  prompts: Prompt[];
  tags: Tag[];
  settings: UserSettings;
}

export interface PromptView extends Prompt {
  tagNames: string[];
  updatedLabel: string;
}
