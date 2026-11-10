import { Tag } from '../models/index';
import { localRepository } from '../repositories/local-repository';
import { createId } from '../utils/id';

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export const tagService = {
  listActive(): Tag[] {
    return localRepository.getTags().filter(tag => !tag.isDeleted);
  },

  create(name: string): { tag?: Tag; error?: string } {
    const trimmed = name.trim();
    if (!trimmed) return { error: '请输入标签名称' };
    if (trimmed.length > 20) return { error: '标签不能超过 20 个字' };
    const normalizedName = normalize(trimmed);
    const duplicate = this.listActive().some(tag => tag.normalizedName === normalizedName);
    if (duplicate) return { error: '标签已存在' };

    const now = Date.now();
    const tag: Tag = {
      id: createId('tag'),
      name: trimmed,
      normalizedName,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      cloudVersion: 0
    };
    localRepository.upsertTag(tag);
    localRepository.markTagDirty(tag);
    return { tag };
  },

  rename(id: string, name: string): { tag?: Tag; error?: string } {
    const existing = localRepository.getTag(id);
    if (!existing) return { error: '标签不存在' };
    const trimmed = name.trim();
    if (!trimmed) return { error: '请输入标签名称' };
    if (trimmed.length > 20) return { error: '标签不能超过 20 个字' };
    const normalizedName = normalize(trimmed);
    const duplicate = this.listActive().some(tag => tag.id !== id && tag.normalizedName === normalizedName);
    if (duplicate) return { error: '标签已存在' };

    const updated = { ...existing, name: trimmed, normalizedName, updatedAt: Date.now() };
    localRepository.upsertTag(updated);
    localRepository.markTagDirty(updated);
    return { tag: updated };
  },

  softDelete(id: string): boolean {
    const existing = localRepository.getTag(id);
    if (!existing) return false;
    const now = Date.now();
    const updated = { ...existing, isDeleted: true, deletedAt: now, updatedAt: now };
    localRepository.upsertTag(updated);
    localRepository.markTagDirty(updated);

    const prompts = localRepository.getPrompts().map(prompt => {
      if (!prompt.tagIds.includes(id)) return prompt;
      const changed = { ...prompt, tagIds: prompt.tagIds.filter(tagId => tagId !== id), updatedAt: now };
      localRepository.markPromptDirty(changed);
      return changed;
    });
    localRepository.savePrompts(prompts);
    return true;
  }
};
