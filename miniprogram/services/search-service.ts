import { Prompt, PromptView, Tag } from '../models/index';
import { formatRelativeTime } from '../utils/date';

export interface PromptFilter {
  query: string;
  selectedTagIds: string[];
}

export function buildPromptViews(prompts: Prompt[], tags: Tag[], filter: PromptFilter): PromptView[] {
  const tagMap = new Map(tags.filter(tag => !tag.isDeleted).map(tag => [tag.id, tag.name]));
  const query = filter.query.trim().toLocaleLowerCase();

  return prompts
    .filter(prompt => !prompt.isDeleted)
    .filter(prompt => {
      const names = prompt.tagIds.map(id => tagMap.get(id) ?? '');
      const matchesQuery = !query || prompt.content.toLocaleLowerCase().includes(query) || names.some(name => name.toLocaleLowerCase().includes(query));
      const matchesTags = filter.selectedTagIds.length === 0 || filter.selectedTagIds.some(id => prompt.tagIds.includes(id));
      return matchesQuery && matchesTags;
    })
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return Number(b.isFavorite) - Number(a.isFavorite);
      return b.updatedAt - a.updatedAt;
    })
    .map(prompt => ({
      ...prompt,
      tagNames: prompt.tagIds.map(id => tagMap.get(id)).filter(Boolean) as string[],
      updatedLabel: formatRelativeTime(prompt.updatedAt)
    }));
}
