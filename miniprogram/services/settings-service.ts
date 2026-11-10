import { UserSettings } from '../models/index';
import { localRepository } from '../repositories/local-repository';

export const settingsService = {
  get(): UserSettings {
    return localRepository.getSettings();
  },

  update(patch: Partial<Omit<UserSettings, 'id'>>): UserSettings {
    const settings: UserSettings = {
      ...localRepository.getSettings(),
      ...patch,
      id: 'settings',
      updatedAt: Date.now()
    };
    localRepository.saveSettings(settings);
    return settings;
  },

  clearLocalData(): void {
    localRepository.clearAllData();
  }
};
