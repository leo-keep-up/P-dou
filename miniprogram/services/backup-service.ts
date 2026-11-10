import { LocalBackup } from '../models/index';
import { localRepository } from '../repositories/local-repository';

export const backupService = {
  list(): LocalBackup[] {
    return localRepository.getBackups().sort((a, b) => b.createdAt - a.createdAt);
  },

  restore(id: string): boolean {
    return localRepository.restoreBackup(id);
  },

  remove(id: string): void {
    localRepository.removeBackup(id);
  }
};
