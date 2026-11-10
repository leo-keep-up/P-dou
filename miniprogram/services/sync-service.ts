import { LocalSyncMeta, Prompt, Tag } from '../models/index';
import { isCloudConfigured } from '../config/cloud';
import { cloudRepository } from '../repositories/cloud-repository';
import { localRepository } from '../repositories/local-repository';
import { settingsService } from './settings-service';
import { createId } from '../utils/id';

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  promptCount: number;
  tagCount: number;
  firstEnable: boolean;
}

interface CollectionSyncResult<T> {
  records: T[];
  uploaded: number;
  downloaded: number;
  conflicts: number;
}

let inFlight: Promise<SyncResult> | null = null;
let editing = false;
let editorEpoch = 0;

function sameContent(a: any, b: any): boolean {
  if (!a || !b) return false;
  const { cloudVersion: av, ...left } = a;
  const { cloudVersion: bv, ...right } = b;
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]));
  return keys.every(key => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

// 网络等待期间产生的新修改不能被旧快照覆盖，也不能误清除 dirty 标记。
function retainNewEdits<T extends Prompt | Tag>(before: T[], synced: T[], current: T[],
  states: LocalSyncMeta['promptStates'], currentStates: LocalSyncMeta['promptStates']): T[] {
  const old = new Map(before.map(record => [record.id, record]));
  const latest = new Map(current.map(record => [record.id, record]));
  const merged = synced.filter(record => !old.has(record.id) || latest.has(record.id)).map(record => {
    const now = latest.get(record.id);
    if (!now || JSON.stringify(now) === JSON.stringify(old.get(record.id))) return record;
    // Only rebase edits over our own successful upload, never over a remote edit.
    const version = sameContent(record, old.get(record.id)) ? record.cloudVersion : now.cloudVersion;
    states[record.id] = {
      ...currentStates[record.id], dirty: true,
      baseCloudVersion: version,
      lastCloudUpdatedAt: record.updatedAt
    };
    return { ...now, cloudVersion: version };
  });
  current.forEach(record => {
    if (!merged.some(item => item.id === record.id)) {
      merged.push(record);
      if (currentStates[record.id]) states[record.id] = currentStates[record.id];
    }
  });
  Object.keys(states).forEach(id => {
    if (!merged.some(item => item.id === id)) delete states[id];
  });
  return merged;
}

function cleanPromptState(meta: LocalSyncMeta, prompt: Prompt): void {
  meta.promptStates[prompt.id] = {
    dirty: false,
    baseCloudVersion: prompt.cloudVersion,
    lastCloudUpdatedAt: prompt.updatedAt
  };
}

function cleanTagState(meta: LocalSyncMeta, tag: Tag): void {
  meta.tagStates[tag.id] = {
    dirty: false,
    baseCloudVersion: tag.cloudVersion,
    lastCloudUpdatedAt: tag.updatedAt
  };
}

async function syncPrompts(localRecords: Prompt[], cloudRecords: Prompt[], meta: LocalSyncMeta): Promise<CollectionSyncResult<Prompt>> {
  const cloudMap = new Map(cloudRecords.map(record => [record.id, record]));
  const result: Prompt[] = [];
  let uploaded = 0;
  let downloaded = 0;
  let conflicts = 0;

  for (const local of localRecords) {
    const cloud = cloudMap.get(local.id);
    const state = meta.promptStates[local.id];
    if (cloud && sameContent(local, cloud)) {
      cloudMap.delete(local.id);
      result.push(cloud);
      cleanPromptState(meta, cloud);
      continue;
    }
    if (editing && (!state?.dirty || (!cloud && local.cloudVersion > 0) || (cloud && state.baseCloudVersion !== cloud.cloudVersion))) {
      cloudMap.delete(local.id);
      result.push(local);
      continue;
    }
    if (!cloud) {
      // Older clients physically removed documents. Keep a tombstone under the old ID;
      // recover unsynced edits under a new ID instead of silently resurrecting it.
      if (local.cloudVersion > 0 && state?.dirty && local.content.trim() && !local.isDeleted) {
        const copy = { ...local, id: createId('conflict'), conflictOf: local.id,
          cloudVersion: 0, updatedAt: Date.now() };
        result.push(copy);
        meta.promptStates[copy.id] = { dirty: true, baseCloudVersion: 0, lastCloudUpdatedAt: null };
        conflicts += 1;
      }
      const uploadedRecord = local.cloudVersion > 0
        ? { ...local, content: '', tagIds: [], isFavorite: false, isDeleted: true, isPurged: true,
          deletedAt: local.deletedAt || Date.now(), updatedAt: Date.now(), cloudVersion: 1 }
        : { ...local, cloudVersion: 1 };
      await cloudRepository.setPrompt(uploadedRecord);
      result.push(uploadedRecord);
      cleanPromptState(meta, uploadedRecord);
      uploaded += 1;
      continue;
    }

    cloudMap.delete(local.id);
    if (state?.dirty && state.baseCloudVersion === cloud.cloudVersion) {
      const uploadedRecord = { ...local, cloudVersion: cloud.cloudVersion + 1 };
      await cloudRepository.setPrompt(uploadedRecord);
      result.push(uploadedRecord);
      cleanPromptState(meta, uploadedRecord);
      uploaded += 1;
    } else if (state?.dirty && state.baseCloudVersion !== cloud.cloudVersion) {
      if (local.content.trim() && !local.isPurged) {
        const copy = { ...local, id: createId('conflict'), conflictOf: local.id,
          isDeleted: false, deletedAt: null, cloudVersion: 0, updatedAt: Date.now() };
        result.push(copy);
        meta.promptStates[copy.id] = { dirty: true, baseCloudVersion: 0, lastCloudUpdatedAt: null };
      }
      result.push(cloud);
      cleanPromptState(meta, cloud);
      downloaded += 1;
      conflicts += 1;
    } else {
      result.push(cloud);
      cleanPromptState(meta, cloud);
      if (local.cloudVersion !== cloud.cloudVersion || local.updatedAt !== cloud.updatedAt) downloaded += 1;
    }
  }

  cloudMap.forEach(cloud => {
    if (editing) return;
    result.push(cloud);
    cleanPromptState(meta, cloud);
    downloaded += 1;
  });

  return { records: result, uploaded, downloaded, conflicts };
}

async function syncTags(localRecords: Tag[], cloudRecords: Tag[], meta: LocalSyncMeta): Promise<CollectionSyncResult<Tag>> {
  const cloudMap = new Map(cloudRecords.map(record => [record.id, record]));
  const result: Tag[] = [];
  let uploaded = 0;
  let downloaded = 0;
  let conflicts = 0;

  for (const local of localRecords) {
    const cloud = cloudMap.get(local.id);
    const state = meta.tagStates[local.id];
    if (cloud && sameContent(local, cloud)) {
      cloudMap.delete(local.id);
      result.push(cloud);
      cleanTagState(meta, cloud);
      continue;
    }
    if (editing && (!state?.dirty || (!cloud && local.cloudVersion > 0) || (cloud && state.baseCloudVersion !== cloud.cloudVersion))) {
      cloudMap.delete(local.id);
      result.push(local);
      continue;
    }
    if (!cloud) {
      const uploadedRecord = { ...local, cloudVersion: 1 };
      await cloudRepository.setTag(uploadedRecord);
      result.push(uploadedRecord);
      cleanTagState(meta, uploadedRecord);
      uploaded += 1;
      continue;
    }

    cloudMap.delete(local.id);
    if (state?.dirty && state.baseCloudVersion === cloud.cloudVersion) {
      const uploadedRecord = { ...local, cloudVersion: cloud.cloudVersion + 1 };
      await cloudRepository.setTag(uploadedRecord);
      result.push(uploadedRecord);
      cleanTagState(meta, uploadedRecord);
      uploaded += 1;
    } else if (state?.dirty && state.baseCloudVersion !== cloud.cloudVersion) {
      if (!local.isDeleted) {
        const name = local.name.slice(0, 14) + '（冲突副本）';
        const copy = { ...local, id: createId('tag'), name, normalizedName: name.toLocaleLowerCase(),
          cloudVersion: 0, updatedAt: Date.now() };
        result.push(copy);
        meta.tagStates[copy.id] = { dirty: true, baseCloudVersion: 0, lastCloudUpdatedAt: null };
      }
      result.push(cloud);
      cleanTagState(meta, cloud);
      downloaded += 1;
      conflicts += 1;
    } else {
      result.push(cloud);
      cleanTagState(meta, cloud);
      if (local.cloudVersion !== cloud.cloudVersion || local.updatedAt !== cloud.updatedAt) downloaded += 1;
    }
  }

  cloudMap.forEach(cloud => {
    if (editing) return;
    result.push(cloud);
    cleanTagState(meta, cloud);
    downloaded += 1;
  });

  return { records: result, uploaded, downloaded, conflicts };
}

export const syncService = {
  setEditing(value: boolean): void { editing = value; editorEpoch += 1; },
  isConfigured(): boolean {
    return isCloudConfigured();
  },

  getStatus(): { configured: boolean; enabled: boolean; lastSyncAt: number | null } {
    return {
      configured: isCloudConfigured(),
      enabled: settingsService.get().cloudSyncEnabled,
      lastSyncAt: localRepository.getSyncMeta().lastSyncAt
    };
  },

  async enable(): Promise<SyncResult> {
    if (!isCloudConfigured()) throw new Error('请先配置 CloudBase 环境 ID');
    localRepository.createBackup('首次开启云同步前');
    await cloudRepository.ensureCollections();
    const [cloudPrompts, cloudTags] = await Promise.all([
      cloudRepository.listPrompts(),
      cloudRepository.listTags()
    ]);

    if (cloudPrompts.length || cloudTags.length) {
      localRepository.savePrompts(cloudPrompts);
      localRepository.saveTags(cloudTags);
      const meta = localRepository.getSyncMeta();
      meta.promptStates = {};
      meta.tagStates = {};
      cloudPrompts.forEach(prompt => cleanPromptState(meta, prompt));
      cloudTags.forEach(tag => cleanTagState(meta, tag));
      meta.lastSyncAt = Date.now();
      localRepository.saveSyncMeta(meta);
      settingsService.update({ cloudSyncEnabled: true });
      return {
        uploaded: 0,
        downloaded: cloudPrompts.length + cloudTags.length,
        conflicts: 0,
        promptCount: cloudPrompts.length,
        tagCount: cloudTags.length,
        firstEnable: true
      };
    }

    // 先标记为已启用。若首次上传中断，下次会走普通合并同步，避免把部分上传误判为既有云数据。
    settingsService.update({ cloudSyncEnabled: true });
    const result = await this.sync();
    return { ...result, firstEnable: true };
  },

  sync(): Promise<SyncResult> {
    if (!inFlight) inFlight = this.performSync().finally(() => { inFlight = null; });
    return inFlight;
  },

  async performSync(): Promise<SyncResult> {
    const epoch = editorEpoch;
    if (!isCloudConfigured()) throw new Error('请先配置 CloudBase 环境 ID');
    const beforePrompts = localRepository.getPrompts();
    const beforeTags = localRepository.getTags();
    const meta = localRepository.getSyncMeta();
    if ([...Object.values(meta.promptStates), ...Object.values(meta.tagStates)].some(item => item.dirty)) {
      const last = localRepository.getBackups()[0];
      if (!last || JSON.stringify([last.prompts, last.tags]) !== JSON.stringify([beforePrompts, beforeTags])) {
        localRepository.createBackup('自动同步前（含本机修改）');
      }
    }
    const [cloudPrompts, cloudTags] = await Promise.all([
      cloudRepository.listPrompts(),
      cloudRepository.listTags()
    ]);
    const promptResult = await syncPrompts(beforePrompts, cloudPrompts, meta);
    const tagResult = await syncTags(beforeTags, cloudTags, meta);

    // An editor opened while the request was in flight: retry without applying a stale download.
    if (editing && epoch !== editorEpoch) throw new Error('编辑已开始，云端结果稍后合并');

    const currentMeta = localRepository.getSyncMeta();
    promptResult.records = retainNewEdits(beforePrompts, promptResult.records, localRepository.getPrompts(), meta.promptStates, currentMeta.promptStates);
    tagResult.records = retainNewEdits(beforeTags, tagResult.records, localRepository.getTags(), meta.tagStates, currentMeta.tagStates);

    localRepository.savePrompts(promptResult.records);
    localRepository.saveTags(tagResult.records);
    meta.lastSyncAt = Date.now();
    localRepository.saveSyncMeta(meta);
    settingsService.update({ cloudSyncEnabled: true });

    return {
      uploaded: promptResult.uploaded + tagResult.uploaded,
      downloaded: promptResult.downloaded + tagResult.downloaded,
      conflicts: promptResult.conflicts + tagResult.conflicts,
      promptCount: promptResult.records.length,
      tagCount: tagResult.records.length,
      firstEnable: false
    };
  }
};
