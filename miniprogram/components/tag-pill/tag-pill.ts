Component({
  properties: {
    label: { type: String, value: '' },
    tagId: { type: String, value: '' },
    selected: { type: Boolean, value: false },
    compact: { type: Boolean, value: false }
  },

  data: { tone: 0 },

  observers: {
    label(value: string) {
      const known: Record<string, number> = { '写作': 0, '工作': 1, '学习': 2, '生活': 3 };
      let hash = 0;
      for (const character of value || '') hash = (hash + character.charCodeAt(0)) % 4;
      this.setData({ tone: Object.prototype.hasOwnProperty.call(known, value) ? known[value] : hash });
    }
  },

  methods: {
    handleTap() {
      this.triggerEvent('change', { id: this.data.tagId });
    }
  }
});
