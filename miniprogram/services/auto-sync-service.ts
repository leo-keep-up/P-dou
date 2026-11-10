import { localRepository } from '../repositories/local-repository';
import { syncService } from './sync-service';

let active = false;
let editing = false;
let running = false;
let timer: any = null;
let retryDelay = 5000;
let status = '';
const listeners: Array<() => void> = [];
function emit(): void { listeners.slice().forEach(listener => listener()); }
function schedule(delay = 2000): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!active || !syncService.getStatus().enabled || !syncService.isConfigured()) return;
  timer = setTimeout(run, delay);
}
async function run(): Promise<void> {
  timer = null;
  if (running || !active || !syncService.getStatus().enabled) return;
  running = true;
  status = '正在自动同步…';
  emit();
  let delay = 60000;
  try {
    const result = await syncService.sync();
    status = result.conflicts ? '已保留冲突副本，请在列表查看' : '已自动同步';
    retryDelay = 5000;
    const meta = localRepository.getSyncMeta();
    if ([...Object.values(meta.promptStates), ...Object.values(meta.tagStates)].some(item => item.dirty)) {
      delay = editing ? 60000 : 2000;
      status = editing ? '已存本机，部分修改待退出编辑后合并' : '正在同步剩余修改…';
    }
  } catch (error) {
    console.error('自动同步失败', error);
    status = '暂未同步，本机内容已保留，将自动重试';
    delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 60000);
  } finally {
    running = false;
    emit();
    schedule(delay);
  }
}

export const autoSyncService = {
  init(): void {
    localRepository.subscribeChanges(() => {
      if (!running) schedule();
    });
    wx.onNetworkStatusChange((event: any) => {
      if (event.isConnected) schedule(500);
    });
  },
  foreground(): void { active = true; schedule(500); },
  background(): void {
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
  },
  setEditing(value: boolean): void { editing = value; syncService.setEditing(value); schedule(); },
  request(): void { schedule(500); },
  getState(): { syncing: boolean; status: string } { return { syncing: running, status }; },
  subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }
};
