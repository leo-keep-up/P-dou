import { Prompt, Tag, UserSettings } from '../models/index';
import { localRepository } from '../repositories/local-repository';

export interface AppState {
  prompts: Prompt[];
  tags: Tag[];
  settings: UserSettings;
}

let state: AppState = {
  prompts: [],
  tags: [],
  settings: localRepository.getSettings()
};

const listeners: Array<(state: AppState) => void> = [];

export const appStore = {
  refresh(): AppState {
    state = {
      prompts: localRepository.getPrompts(),
      tags: localRepository.getTags(),
      settings: localRepository.getSettings()
    };
    listeners.forEach(listener => listener(state));
    return state;
  },

  snapshot(): AppState {
    return state;
  },

  subscribe(listener: (state: AppState) => void): () => void {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }
};
