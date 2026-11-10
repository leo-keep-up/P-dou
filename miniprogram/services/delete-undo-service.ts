export interface PendingDelete {
  id: string;
  preview: string;
  expiresAt: number;
}

let pendingDelete: PendingDelete | null = null;

export const deleteUndoService = {
  offer(id: string, content: string, duration = 6000): PendingDelete {
    pendingDelete = {
      id,
      preview: content.replace(/\s+/g, ' ').trim().slice(0, 24),
      expiresAt: Date.now() + duration
    };
    return pendingDelete;
  },

  get(): PendingDelete | null {
    if (!pendingDelete) return null;
    if (pendingDelete.expiresAt <= Date.now()) {
      pendingDelete = null;
      return null;
    }
    return pendingDelete;
  },

  clear(id?: string): void {
    if (!id || pendingDelete?.id === id) pendingDelete = null;
  }
};
