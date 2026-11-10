import { Prompt } from '../models/index';
import { localRepository } from '../repositories/local-repository';
import { createId } from '../utils/id';
import { isCloudConfigured } from '../config/cloud';
import { cloudRepository } from '../repositories/cloud-repository';

export interface SavePromptInput {
  id?: string;
  content: string;
  tagIds: string[];
  isFavorite?: boolean;
}

function updateActivePrompts(ids: string[], update: (prompt: Prompt) => Prompt): number {
  const selected = new Set(ids);
  const changed: Prompt[] = [];
  const prompts = localRepository.getPrompts().map(prompt => {
    if (prompt.isDeleted || !selected.has(prompt.id)) return prompt;
    const next = update(prompt);
    if (next !== prompt) changed.push(next);
    return next;
  });
  if (!changed.length) return 0;
  localRepository.savePrompts(prompts);
  changed.forEach(prompt => localRepository.markPromptDirty(prompt));
  return changed.length;
}

export const promptService = {
  listAll(): Prompt[] {
    return localRepository.getPrompts();
  },

  listDeleted(): Prompt[] {
    return localRepository.getPrompts()
      .filter(prompt => prompt.isDeleted && !prompt.isPurged)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  },

  get(id: string): Prompt | undefined {
    return localRepository.getPrompt(id);
  },

  save(input: SavePromptInput): Prompt | null {
    if (!input.content.trim()) return null;

    const now = Date.now();
    const existing = input.id ? localRepository.getPrompt(input.id) : undefined;
    const prompt: Prompt = {
      id: existing?.id ?? createId('prompt'),
      content: input.content,
      tagIds: Array.from(new Set(input.tagIds)),
      isFavorite: input.isFavorite ?? existing?.isFavorite ?? false,
      isDeleted: false,
      deletedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      cloudVersion: existing?.cloudVersion ?? 0
    };

    localRepository.upsertPrompt(prompt);
    localRepository.markPromptDirty(prompt);
    return prompt;
  },

  toggleFavorite(id: string): Prompt | null {
    const existing = localRepository.getPrompt(id);
    if (!existing) return null;
    const updated = { ...existing, isFavorite: !existing.isFavorite, updatedAt: Date.now() };
    localRepository.upsertPrompt(updated);
    localRepository.markPromptDirty(updated);
    return updated;
  },

  batchSetFavorite(ids: string[], isFavorite: boolean): number {
    const now = Date.now();
    return updateActivePrompts(ids, prompt =>
      prompt.isFavorite === isFavorite ? prompt : { ...prompt, isFavorite, updatedAt: now }
    );
  },

  batchAddTags(ids: string[], tagIds: string[]): number {
    const additions = new Set(tagIds);
    const now = Date.now();
    return updateActivePrompts(ids, prompt => {
      const nextTagIds = Array.from(new Set([...prompt.tagIds, ...additions]));
      if (nextTagIds.length === prompt.tagIds.length) return prompt;
      return { ...prompt, tagIds: nextTagIds, updatedAt: now };
    });
  },

  batchRemoveTags(ids: string[], tagIds: string[]): number {
    const removals = new Set(tagIds);
    const now = Date.now();
    return updateActivePrompts(ids, prompt => {
      const nextTagIds = prompt.tagIds.filter(tagId => !removals.has(tagId));
      if (nextTagIds.length === prompt.tagIds.length) return prompt;
      return { ...prompt, tagIds: nextTagIds, updatedAt: now };
    });
  },

  batchSoftDelete(ids: string[]): number {
    const now = Date.now();
    return updateActivePrompts(ids, prompt => ({
      ...prompt,
      isDeleted: true,
      deletedAt: now,
      updatedAt: now
    }));
  },

  softDelete(id: string): boolean {
    const existing = localRepository.getPrompt(id);
    if (!existing) return false;
    const now = Date.now();
    const updated = { ...existing, isDeleted: true, deletedAt: now, updatedAt: now };
    localRepository.upsertPrompt(updated);
    localRepository.markPromptDirty(updated);
    return true;
  },

  restore(id: string): boolean {
    const existing = localRepository.getPrompt(id);
    if (!existing || existing.isPurged) return false;
    const updated = { ...existing, isDeleted: false, deletedAt: null, updatedAt: Date.now() };
    localRepository.upsertPrompt(updated);
    localRepository.markPromptDirty(updated);
    return true;
  },

  async hardDelete(id: string): Promise<boolean> {
    const existing = localRepository.getPrompt(id);
    if (!existing?.isDeleted) return false;
    if (existing.cloudVersion > 0) {
      if (!isCloudConfigured()) return false;
      const syncState = localRepository.getSyncMeta().promptStates[id];
      // 已上传过的记录必须先把“已删除”墓碑同步到云端，避免其他设备把旧内容重新上传回来。
      if (!syncState || syncState.dirty) return false;
      const tombstone = { ...existing, content: '', tagIds: [], isFavorite: false,
        isPurged: true, updatedAt: Date.now(), cloudVersion: existing.cloudVersion + 1 };
      await cloudRepository.setPrompt(tombstone);
      // Retain an empty tombstone so a stale device cannot recreate deleted text.
      const latest = localRepository.getPrompt(id);
      if (JSON.stringify(latest) !== JSON.stringify(existing)) return false;
      localRepository.upsertPrompt(tombstone);
      const meta = localRepository.getSyncMeta();
      meta.promptStates[id] = { dirty: false, baseCloudVersion: tombstone.cloudVersion, lastCloudUpdatedAt: tombstone.updatedAt };
      localRepository.saveSyncMeta(meta);
      return true;
    }
    if (localRepository.getSettings().cloudSyncEnabled) {
      // Even version 0 may already be uploading. Preserve a deletion marker until synced.
      const tombstone = { ...existing, content: '', tagIds: [], isFavorite: false,
        isPurged: true, updatedAt: Date.now() };
      localRepository.upsertPrompt(tombstone);
      localRepository.markPromptDirty(tombstone);
    } else {
      localRepository.removePrompt(id);
    }
    return true;
  },

  purgeExpired(retentionDays: number): number {
    if (localRepository.getSettings().cloudSyncEnabled) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const expired = this.listDeleted().filter(prompt =>
      prompt.cloudVersion === 0 &&
      prompt.deletedAt !== null &&
      prompt.deletedAt < cutoff
    );
    expired.forEach(prompt => localRepository.removePrompt(prompt.id));
    return expired.length;
  }
};
