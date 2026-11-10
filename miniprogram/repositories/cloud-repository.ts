import { Prompt, Tag } from '../models/index';
import { isCloudConfigured } from '../config/cloud';

type CloudDocument<T> = T & { _id: string; _openid?: string };

function database(): any {
  if (!isCloudConfigured()) throw new Error('CloudBase 环境尚未配置');
  return wx.cloud.database();
}

async function listAll<T>(collectionName: string): Promise<Array<CloudDocument<T>>> {
  const collection = database().collection(collectionName);
  const pageSize = 20;
  const records: Array<CloudDocument<T>> = [];
  let offset = 0;

  while (true) {
    const result = await collection.skip(offset).limit(pageSize).get();
    const page = result.data as Array<CloudDocument<T>>;
    records.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return records;
}

function stripCloudFields<T extends { _id: string; _openid?: string }>(document: T): Omit<T, '_id' | '_openid'> {
  const { _id, _openid, ...data } = document;
  return data;
}

export const cloudRepository = {
  async ensureCollections(): Promise<void> {
    if (!isCloudConfigured()) throw new Error('CloudBase 环境尚未配置');
    const response = await wx.cloud.callFunction({ name: 'cloud-setup' });
    const result = response && response.result;
    if (!result || result.ok !== true) throw new Error('云端数据库初始化失败');
  },

  async listPrompts(): Promise<Prompt[]> {
    const documents = await listAll<Prompt>('prompts');
    return documents.map(document => stripCloudFields(document) as Prompt);
  },

  async listTags(): Promise<Tag[]> {
    const documents = await listAll<Tag>('tags');
    return documents.map(document => stripCloudFields(document) as Tag);
  },

  async setPrompt(prompt: Prompt): Promise<void> {
    await this.writeVersioned('prompts', prompt);
  },

  async setTag(tag: Tag): Promise<void> {
    await this.writeVersioned('tags', tag);
  },

  async writeVersioned(collection: string, record: Prompt | Tag): Promise<void> {
    const response = await wx.cloud.callFunction({ name: 'sync-write', data: {
      collection, record, expectedVersion: record.cloudVersion - 1
    } });
    const result = response && response.result;
    if (!result || !result.ok) {
      const error: any = new Error(result?.conflict ? '云端版本已变化' : '自动同步服务尚未就绪');
      error.conflict = Boolean(result?.conflict);
      error.record = result?.record;
      throw error;
    }
    record.cloudVersion = result.record.cloudVersion;
  }
};
