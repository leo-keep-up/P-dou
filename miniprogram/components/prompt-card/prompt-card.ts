Component({
  properties: {
    prompt: { type: Object, value: null }
  },

  data: { headline: '', excerpt: '' },

  observers: {
    prompt(value: any) {
      const content = String(value && value.content || '').trim();
      const lines = content.split(/\r?\n/).filter((line: string) => line.trim());
      this.setData({
        headline: lines[0] || '空白提示词',
        excerpt: lines.length > 1 ? lines.slice(1).join(' ') : content
      });
    }
  },

  methods: {
    openDetail() {
      this.triggerEvent('open', { id: this.data.prompt.id });
    },

    copyPrompt() {
      this.triggerEvent('copy', { id: this.data.prompt.id, content: this.data.prompt.content });
    },

    toggleFavorite() {
      this.triggerEvent('favorite', { id: this.data.prompt.id });
    },

    swallow() {}
  }
});
